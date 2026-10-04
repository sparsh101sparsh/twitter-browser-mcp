import type { Page } from "playwright";
import { BrowserSessionManager, defaultSessionManager } from "../browser/session.js";
import { checkSecurityChallenges, TwitterSafetyError } from "../browser/guardrails.js";
import { validateMediaPaths, attachMediaAndWait } from "./media.js";
import { defaultRateLimiter } from "../utils/rate_limiter.js";
import type {
  PostTweetArgs,
  PostTweetResult,
  SearchTweetsArgs,
  SearchTweetsResult,
  TweetItem,
  GetProfileArgs,
  TwitterProfile,
} from "../types.js";

export class TwitterService {
  private sessionManager: BrowserSessionManager;

  constructor(sessionManager?: BrowserSessionManager) {
    this.sessionManager = sessionManager || defaultSessionManager;
  }

  public async postTweet(args: PostTweetArgs): Promise<PostTweetResult> {
    const text = args.text?.trim() || "";
    const mediaPaths = args.media_paths || [];

    if (!text && mediaPaths.length === 0) {
      throw new Error("Must provide either text content or at least one media path to post a tweet.");
    }

    // Character validation
    if (text.length > 280 && !args.allow_long_tweet) {
      throw new Error(
        `Tweet exceeds 280 character limit (length: ${text.length}). Set allow_long_tweet: true if using an X Premium account.`
      );
    }

    // Validate media files before opening browser
    validateMediaPaths(mediaPaths);

    // Rate limiter pacing safeguard
    await defaultRateLimiter.enforcePacing("post_tweet");

    return await this.sessionManager.withPage(async (page: Page) => {
      console.error("[twitter] Navigating to compose modal...");
      await page.goto("https://x.com/compose/post", {
        waitUntil: "domcontentloaded",
        timeout: 30000,
      });

      // Security / checkpoint check
      await checkSecurityChallenges(page);

      // Locate tweet textarea
      const textarea = page.locator("[data-testid='tweetTextarea_0'], div[role='textbox']").first();
      await textarea.waitFor({ state: "visible", timeout: 20000 });

      // Insert text content if provided
      if (text) {
        await textarea.click();
        await page.keyboard.insertText(text);
        await page.waitForTimeout(500);
      }

      // Attach media if provided
      if (mediaPaths.length > 0) {
        await attachMediaAndWait(page, mediaPaths);
      }

      // Check guardrails again after input & media
      await checkSecurityChallenges(page);

      // Locate Post button (modal or inline)
      const postButton = page
        .locator("[data-testid='tweetButton'], [data-testid='tweetButtonInline']")
        .first();
      await postButton.waitFor({ state: "visible", timeout: 10000 });

      // Check if button is disabled
      const ariaDisabled = await postButton.getAttribute("aria-disabled");
      if (ariaDisabled === "true") {
        throw new Error(
          "Post button is disabled. Tweet content may be over the character limit or media processing was rejected."
        );
      }

      console.error("[twitter] Clicking Post button...");
      await postButton.click();

      // Wait for completion (toast notification or compose modal closing)
      let tweetUrl: string | undefined;
      let tweetId: string | undefined;

      try {
        const toastLocator = page.locator("[data-testid='toast']").first();
        const toastVisible = await toastLocator.waitFor({ state: "visible", timeout: 15000 }).then(() => true).catch(() => false);

        if (toastVisible) {
          const toastText = await toastLocator.innerText().catch(() => "");
          console.error(`[twitter] Toast notification: ${toastText}`);

          if (/already said that/i.test(toastText) || /unable to post/i.test(toastText) || /error/i.test(toastText)) {
            throw new Error(`Failed to post tweet: ${toastText}`);
          }

          const toastLink = toastLocator.locator("a[href*='/status/']").first();
          if (await toastLink.isVisible().catch(() => false)) {
            const href = await toastLink.getAttribute("href");
            if (href) {
              tweetUrl = href.startsWith("http") ? href : `https://x.com${href}`;
              const match = href.match(/\/status\/(\d+)/);
              if (match) tweetId = match[1];
            }
          }
        } else {
          // If no toast, ensure compose modal closed
          await page.waitForTimeout(3000);
        }
      } catch (err: any) {
        if (err.message?.includes("Failed to post tweet")) throw err;
        console.error(`[twitter] Post completion check: ${err.message}`);
      }

      console.error("[twitter] Tweet posted successfully!");
      return {
        status: "success",
        message: "Tweet posted successfully",
        tweet_url: tweetUrl,
        tweet_id: tweetId,
        text,
        media_count: mediaPaths.length,
      };
    });
  }

  public async searchTweets(args: SearchTweetsArgs): Promise<SearchTweetsResult> {
    const query = args.query?.trim();
    if (!query) {
      throw new Error("Search query cannot be empty.");
    }

    const limit = defaultRateLimiter.clampSearchLimit(args.limit);
    const mode = args.mode === "top" ? "top" : "live";

    await defaultRateLimiter.enforcePacing("search_tweets");

    return await this.sessionManager.withPage(async (page: Page) => {
      const modeParam = mode === "top" ? "" : "&f=live";
      const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}${modeParam}`;

      console.error(`[twitter] Navigating to search: ${searchUrl}`);
      await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      await checkSecurityChallenges(page);

      // Wait for results container or empty state
      try {
        await page.waitForSelector("article[data-testid='tweet'], [data-testid='empty_state']", {
          timeout: 15000,
        });
      } catch (_) {
        console.error("[twitter] Search selector wait timed out, continuing to parse available content...");
      }

      await checkSecurityChallenges(page);

      const tweetsMap = new Map<string, TweetItem>();
      let scrollAttempts = 0;
      const maxScrolls = 3; // Enforce twitter-safe-use rule: never endlessly scroll

      while (tweetsMap.size < limit && scrollAttempts <= maxScrolls) {
        const extracted = await page.evaluate(() => {
          const articles = Array.from(document.querySelectorAll("article[data-testid='tweet']"));
          return articles.map((art) => {
            const userEl = art.querySelector("[data-testid='User-Name']") as HTMLElement | null;
            const userLines = userEl ? (userEl.innerText || "").split("\n").filter(Boolean) : [];
            const timeEl = art.querySelector("time");
            const timeLink = timeEl ? timeEl.closest("a") : null;
            const textEl = art.querySelector("[data-testid='tweetText']") as HTMLElement | null;

            const replyBtn = art.querySelector("[data-testid='reply']");
            const retweetBtn = art.querySelector("[data-testid='retweet']");
            const likeBtn = art.querySelector("[data-testid='like']");

            const hasPhotos = !!art.querySelector("[data-testid='tweetPhoto']");
            const hasVideo = !!art.querySelector("video");

            const url = timeLink ? timeLink.href : undefined;
            const match = url ? url.match(/\/status\/(\d+)/) : null;
            const id = match ? match[1] : undefined;

            return {
              id,
              author_name: userLines[0] || "",
              author_handle: userLines[1] || "",
              timestamp: timeEl ? timeEl.getAttribute("datetime") || undefined : undefined,
              url,
              text: textEl ? (textEl.innerText || "") : "",
              replies: replyBtn ? replyBtn.getAttribute("aria-label") || undefined : undefined,
              retweets: retweetBtn ? retweetBtn.getAttribute("aria-label") || undefined : undefined,
              likes: likeBtn ? likeBtn.getAttribute("aria-label") || undefined : undefined,
              has_media: hasPhotos || hasVideo,
            };
          });
        });

        for (const t of extracted) {
          const key = t.id || t.url || `${t.author_handle}:${t.text.substring(0, 30)}`;
          if (!tweetsMap.has(key)) {
            tweetsMap.set(key, t);
          }
          if (tweetsMap.size >= limit) break;
        }

        if (tweetsMap.size >= limit || scrollAttempts >= maxScrolls) break;

        // Scroll down slightly
        await page.evaluate(() => window.scrollBy(0, 1000));
        await page.waitForTimeout(2000);
        scrollAttempts++;
      }

      const tweets = Array.from(tweetsMap.values()).slice(0, limit);
      console.error(`[twitter] Found ${tweets.length} tweets for query '${query}'`);

      return {
        query,
        mode,
        count: tweets.length,
        tweets,
      };
    });
  }

  public async getProfile(args: GetProfileArgs): Promise<TwitterProfile> {
    const rawUsername = args.username?.trim();
    if (!rawUsername) {
      throw new Error("Username cannot be empty.");
    }
    const cleanUsername = rawUsername.replace(/^@/, "");

    await defaultRateLimiter.enforcePacing("get_profile");

    return await this.sessionManager.withPage(async (page: Page) => {
      const profileUrl = `https://x.com/${cleanUsername}`;
      console.error(`[twitter] Navigating to profile: ${profileUrl}`);
      await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

      await checkSecurityChallenges(page);

      // Check if profile exists
      try {
        await page.waitForSelector("[data-testid='UserName'], [data-testid='empty_state']", {
          timeout: 15000,
        });
      } catch (_) {}

      await checkSecurityChallenges(page);

      const profileData = await page.evaluate(() => {
        const nameEl = document.querySelector("[data-testid='UserName']") as HTMLElement | null;
        const userText = nameEl ? (nameEl.innerText || "") : "";
        const lines = userText.split("\n").filter(Boolean);

        const bioEl = document.querySelector("[data-testid='UserDescription']") as HTMLElement | null;
        const locationEl = document.querySelector("[data-testid='UserLocation']") as HTMLElement | null;
        const urlEl = document.querySelector("[data-testid='UserUrl']") as HTMLElement | null;
        const joinEl = document.querySelector("[data-testid='UserJoinDate']") as HTMLElement | null;
        const followingEl = document.querySelector("a[href$='/following']") as HTMLElement | null;
        const followersEl = document.querySelector("a[href$='/verified_followers'], a[href$='/followers']") as HTMLElement | null;
        const verifiedEl = document.querySelector("[data-testid='icon-verified']");

        return {
          name: lines[0] || "",
          handle: lines[1] || "",
          bio: bioEl ? bioEl.innerText : undefined,
          location: locationEl ? locationEl.innerText : undefined,
          url: urlEl ? urlEl.innerText : undefined,
          joined: joinEl ? joinEl.innerText : undefined,
          following: followingEl ? followingEl.innerText : undefined,
          followers: followersEl ? followersEl.innerText : undefined,
          verified: !!verifiedEl,
        };
      });

      if (!profileData.name && !profileData.handle) {
        // Check for "This account doesn’t exist"
        const pageText = await page.evaluate(() => document.body ? document.body.innerText : "");
        if (/this account doesn’t exist/i.test(pageText)) {
          throw new Error(`Twitter user '@${cleanUsername}' does not exist.`);
        }
      }

      return {
        username: cleanUsername,
        name: profileData.name || cleanUsername,
        handle: profileData.handle || `@${cleanUsername}`,
        bio: profileData.bio,
        location: profileData.location,
        url: profileData.url,
        joined: profileData.joined,
        following: profileData.following,
        followers: profileData.followers,
        verified: profileData.verified,
        profile_url: profileUrl,
      };
    });
  }
}

export const defaultTwitterService = new TwitterService();
