import { defaultSessionManager } from "../browser/session.js";
import { checkSecurityChallenges } from "../browser/guardrails.js";
import { validateMediaPaths, attachMediaAndWait } from "./media.js";
import { defaultRateLimiter } from "../utils/rate_limiter.js";
export function calculateTweetLength(text) {
    if (!text)
        return 0;
    const urlRegex = /https?:\/\/[^\s]+/gi;
    const withoutUrls = text.replace(urlRegex, "");
    const urlMatches = text.match(urlRegex) || [];
    // Twitter counts all URLs as 23 characters (t.co standard)
    const urlLength = urlMatches.length * 23;
    // Proper unicode code point length (e.g. emojis)
    const textLength = Array.from(withoutUrls).length;
    return urlLength + textLength;
}
export class TwitterService {
    sessionManager;
    constructor(sessionManager) {
        this.sessionManager = sessionManager || defaultSessionManager;
    }
    async postTweet(args) {
        args = args || {};
        const rawText = typeof args.text === "string"
            ? args.text
            : args.text !== undefined && args.text !== null
                ? String(args.text)
                : "";
        const text = rawText.trim();
        const mediaPaths = Array.isArray(args.media_paths) ? args.media_paths : [];
        if (!text && mediaPaths.length === 0) {
            throw new Error("Must provide either text content or at least one media path to post a tweet.");
        }
        // Character validation taking URL shortening and unicode code points into account
        const tweetLen = calculateTweetLength(text);
        if (tweetLen > 280 && !args.allow_long_tweet) {
            throw new Error(`Tweet exceeds 280 character limit (calculated length: ${tweetLen}). Set allow_long_tweet: true if using an X Premium account.`);
        }
        // Validate media files before opening browser
        validateMediaPaths(mediaPaths);
        return await this.sessionManager.withPage(async (page) => {
            // Rate limiter pacing safeguard inside sequential lock
            await defaultRateLimiter.enforcePacing("post_tweet");
            let tweetUrl;
            let tweetId;
            let apiErrorMessage;
            // Intercept CreateTweet / CreateNoteTweet GraphQL responses for reliable status & ID
            const tweetResponseHandler = async (res) => {
                const url = res.url();
                if (url.includes("/graphql/") &&
                    (url.includes("CreateTweet") || url.includes("CreateNoteTweet"))) {
                    try {
                        const respText = await res.text();
                        const data = JSON.parse(respText);
                        if (data.errors && data.errors.length > 0) {
                            apiErrorMessage = data.errors
                                .map((e) => e.message || JSON.stringify(e))
                                .join("; ");
                            return;
                        }
                        const tweetResult = data?.data?.create_tweet?.tweet_results?.result ||
                            data?.data?.notetweet_create?.tweet_results?.result;
                        if (tweetResult) {
                            const restId = tweetResult.rest_id;
                            if (restId) {
                                tweetId = restId;
                                const screenName = tweetResult.core?.user_results?.result?.legacy?.screen_name;
                                tweetUrl = screenName
                                    ? `https://x.com/${screenName}/status/${restId}`
                                    : `https://x.com/i/status/${restId}`;
                            }
                        }
                    }
                    catch (_) { }
                }
            };
            page.on("response", tweetResponseHandler);
            try {
                console.error("[twitter] Navigating to compose modal...");
                await page.goto("https://x.com/compose/post", {
                    waitUntil: "domcontentloaded",
                    timeout: 30000,
                });
                // Security / checkpoint check
                await checkSecurityChallenges(page);
                // Locate tweet textarea
                const textarea = page
                    .locator("[role='dialog'] [data-testid='tweetTextarea_0'], [role='dialog'] div[role='textbox'], [data-testid='tweetTextarea_0'], div[role='textbox']")
                    .first();
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
                // Locate Post button (scope to modal if present)
                const composeModal = page.locator("[role='dialog']").first();
                const isModal = await composeModal.isVisible().catch(() => false);
                const postButton = isModal
                    ? composeModal
                        .locator("[data-testid='tweetButton'], [data-testid='tweetButtonInline'], button:has-text('Post'), button:has-text('Tweet')")
                        .first()
                    : page
                        .locator("[data-testid='tweetButton'], [data-testid='tweetButtonInline'], button:has-text('Post'), button:has-text('Tweet')")
                        .first();
                await postButton.waitFor({ state: "visible", timeout: 10000 });
                // Check if button is disabled
                const ariaDisabled = await postButton.getAttribute("aria-disabled");
                if (ariaDisabled === "true") {
                    throw new Error("Post button is disabled. Tweet content may be over the character limit or media processing was rejected.");
                }
                console.error("[twitter] Clicking Post button...");
                await postButton.click();
                // Check API error first if already arrived
                if (apiErrorMessage) {
                    throw new Error(`Failed to post tweet: ${apiErrorMessage}`);
                }
                // Wait for completion (toast notification or compose modal closing)
                const toastLocator = page.locator("[data-testid='toast']").first();
                const toastVisible = await toastLocator
                    .waitFor({ state: "visible", timeout: 10000 })
                    .then(() => true)
                    .catch(() => false);
                if (toastVisible) {
                    const toastText = await toastLocator.innerText().catch(() => "");
                    console.error(`[twitter] Toast notification: ${toastText}`);
                    if (/already said that|already tweeted that|unable to post|could not be sent|not sent|error|limit exceeded|something went wrong|blocked|restricted/i.test(toastText)) {
                        throw new Error(`Failed to post tweet: ${toastText}`);
                    }
                    if (!tweetUrl) {
                        const toastLink = toastLocator.locator("a[href*='/status/']").first();
                        if (await toastLink.isVisible().catch(() => false)) {
                            const href = await toastLink.getAttribute("href");
                            if (href) {
                                tweetUrl = href.startsWith("http") ? href : `https://x.com${href}`;
                                const match = href.match(/\/status\/(\d+)/);
                                if (match)
                                    tweetId = match[1];
                            }
                        }
                    }
                }
                // Check for error alert dialogs
                const alertDialog = page.locator("[role='alertdialog'], [role='alert']").first();
                if (await alertDialog.isVisible().catch(() => false)) {
                    const alertText = await alertDialog.innerText().catch(() => "");
                    if (/already said that|already tweeted that|unable to post|could not be sent|not sent|error|limit exceeded|something went wrong|blocked|restricted/i.test(alertText)) {
                        throw new Error(`Failed to post tweet: ${alertText}`);
                    }
                }
                // Wait for compose modal to close if not already closed
                if (isModal) {
                    await composeModal.waitFor({ state: "hidden", timeout: 10000 }).catch(() => { });
                    const isModalStillOpen = await composeModal.isVisible().catch(() => false);
                    const isButtonStillVisible = await postButton.isVisible().catch(() => false);
                    if (isModalStillOpen && isButtonStillVisible) {
                        if (apiErrorMessage) {
                            throw new Error(`Failed to post tweet: ${apiErrorMessage}`);
                        }
                        throw new Error("Failed to post tweet: compose modal remained open after clicking Post.");
                    }
                }
                if (apiErrorMessage) {
                    throw new Error(`Failed to post tweet: ${apiErrorMessage}`);
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
            }
            finally {
                page.off("response", tweetResponseHandler);
                defaultRateLimiter.recordActionCompleted();
            }
        });
    }
    async searchTweets(args) {
        args = args || {};
        const rawQuery = typeof args.query === "string"
            ? args.query
            : args.query !== undefined && args.query !== null
                ? String(args.query)
                : "";
        const query = rawQuery.trim();
        if (!query) {
            throw new Error("Search query cannot be empty.");
        }
        const limit = defaultRateLimiter.clampSearchLimit(args.limit);
        const mode = args.mode === "top" ? "top" : "live";
        return await this.sessionManager.withPage(async (page) => {
            // Enforce pacing inside sequential lock
            await defaultRateLimiter.enforcePacing("search_tweets");
            try {
                const modeParam = mode === "top" ? "" : "&f=live";
                const searchUrl = `https://x.com/search?q=${encodeURIComponent(query)}${modeParam}`;
                console.error(`[twitter] Navigating to search: ${searchUrl}`);
                await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
                await checkSecurityChallenges(page);
                // Fast wait for results container or empty indicator
                try {
                    await page.waitForFunction(() => {
                        const hasTweet = !!document.querySelector("article[data-testid='tweet']");
                        const text = document.body ? document.body.innerText : "";
                        const hasEmpty = text.includes("No results for") ||
                            text.includes("Try searching for") ||
                            !!document.querySelector("[data-testid='empty_state'], [data-testid='emptyState']");
                        return hasTweet || hasEmpty;
                    }, { timeout: 15000 });
                }
                catch (_) {
                    console.error("[twitter] Search selector wait timed out, continuing to parse available content...");
                }
                await checkSecurityChallenges(page);
                // Early return ONLY if no tweets exist AND empty state is detected
                const isEmptyState = await page.evaluate(() => {
                    const hasTweet = !!document.querySelector("article[data-testid='tweet']");
                    if (hasTweet)
                        return false;
                    const text = document.body ? document.body.innerText : "";
                    const emptyEl = document.querySelector("[data-testid='empty_state'], [data-testid='emptyState']");
                    return (!!emptyEl ||
                        text.includes("No results for") ||
                        text.includes("Try searching for something else"));
                });
                if (isEmptyState) {
                    console.error(`[twitter] No results found for query '${query}'`);
                    return {
                        query,
                        mode,
                        count: 0,
                        tweets: [],
                    };
                }
                const tweetsMap = new Map();
                let scrollAttempts = 0;
                // Dynamically scale max scrolls with requested limit (capped to prevent endless pagination)
                const maxScrolls = Math.max(3, Math.min(10, Math.ceil(limit / 5)));
                while (tweetsMap.size < limit && scrollAttempts <= maxScrolls) {
                    const extracted = await page.evaluate(() => {
                        const articles = Array.from(document.querySelectorAll("article[data-testid='tweet'], article[role='article']"));
                        return articles
                            .filter((art) => {
                            const htmlArt = art;
                            const isPromoted = !!art.querySelector("[data-testid='icon-promoted'], [aria-label*='Promoted'], [data-testid='placementTracking']") ||
                                (htmlArt.innerText || "").includes("Promoted\n") ||
                                (htmlArt.innerText || "").endsWith("\nPromoted") ||
                                (htmlArt.innerText || "").includes("\nAd\n") ||
                                (htmlArt.innerText || "").endsWith("\nAd");
                            return !isPromoted;
                        })
                            .map((art) => {
                            const userEl = art.querySelector("[data-testid='User-Name'], [data-testid='UserName']");
                            const userLines = userEl ? (userEl.innerText || "").split("\n").filter(Boolean) : [];
                            const timeEl = art.querySelector("time");
                            const timeLink = timeEl ? timeEl.closest("a") : null;
                            const textEl = art.querySelector("[data-testid='tweetText']");
                            const replyBtn = art.querySelector("[data-testid='reply']");
                            const retweetBtn = art.querySelector("[data-testid='retweet']");
                            const likeBtn = art.querySelector("[data-testid='like']");
                            const hasPhotos = !!art.querySelector("[data-testid='tweetPhoto']");
                            const hasVideo = !!art.querySelector("video");
                            const handleLine = userLines.find((l) => l.startsWith("@"));
                            const author_handle = handleLine || (userLines[1] ? `@${userLines[1].replace(/^@/, "")}` : "");
                            const author_name = userLines[0] && !userLines[0].startsWith("@") ? userLines[0] : userLines[0] || "";
                            const cleanHandle = author_handle.replace(/^@/, "");
                            const userStatusLink = cleanHandle
                                ? art.querySelector(`a[href*='/${cleanHandle}/status/']`)
                                : null;
                            const generalStatusLink = art.querySelector("a[href*='/status/']");
                            const url = timeLink
                                ? timeLink.href
                                : userStatusLink
                                    ? userStatusLink.href
                                    : generalStatusLink
                                        ? generalStatusLink.href
                                        : undefined;
                            const match = url ? url.match(/\/status\/(\d+)/) : null;
                            const id = match ? match[1] : undefined;
                            return {
                                id,
                                author_name,
                                author_handle,
                                timestamp: timeEl ? timeEl.getAttribute("datetime") || undefined : undefined,
                                url,
                                text: textEl ? textEl.innerText || "" : "",
                                replies: replyBtn ? replyBtn.getAttribute("aria-label") || undefined : undefined,
                                retweets: retweetBtn ? retweetBtn.getAttribute("aria-label") || undefined : undefined,
                                likes: likeBtn ? likeBtn.getAttribute("aria-label") || undefined : undefined,
                                has_media: hasPhotos || hasVideo,
                            };
                        });
                    });
                    const prevCount = tweetsMap.size;
                    for (const t of extracted) {
                        const key = t.id ||
                            t.url ||
                            `${t.author_handle}:${t.timestamp || ""}:${t.text.substring(0, 40)}`;
                        if (!tweetsMap.has(key)) {
                            tweetsMap.set(key, t);
                        }
                        if (tweetsMap.size >= limit)
                            break;
                    }
                    if (tweetsMap.size >= limit || scrollAttempts >= maxScrolls)
                        break;
                    // If no new tweets found after scrolling, stop
                    if (scrollAttempts > 0 && tweetsMap.size === prevCount) {
                        console.error("[twitter] No new tweets found on scroll, ending search early.");
                        break;
                    }
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
            }
            finally {
                defaultRateLimiter.recordActionCompleted();
            }
        });
    }
    async getProfile(args) {
        args = args || {};
        const rawUsername = typeof args.username === "string"
            ? args.username
            : args.username !== undefined && args.username !== null
                ? String(args.username)
                : "";
        const cleanUsername = rawUsername.trim().replace(/^@/, "");
        if (!cleanUsername) {
            throw new Error("Username cannot be empty.");
        }
        return await this.sessionManager.withPage(async (page) => {
            // Enforce pacing inside sequential lock
            await defaultRateLimiter.enforcePacing("get_profile");
            try {
                const profileUrl = `https://x.com/${cleanUsername}`;
                console.error(`[twitter] Navigating to profile: ${profileUrl}`);
                await page.goto(profileUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
                await checkSecurityChallenges(page);
                // Check if profile exists
                try {
                    await page.waitForSelector("[data-testid='UserName'], [data-testid='User-Name'], [data-testid='empty_state'], [data-testid='emptyState']", {
                        timeout: 15000,
                    });
                }
                catch (_) { }
                await checkSecurityChallenges(page);
                const profileData = await page.evaluate(() => {
                    const nameEl = document.querySelector("[data-testid='UserName'], [data-testid='User-Name']");
                    const userText = nameEl ? nameEl.innerText || "" : "";
                    const lines = userText.split("\n").filter(Boolean);
                    const bioEl = document.querySelector("[data-testid='UserDescription']");
                    const locationEl = document.querySelector("[data-testid='UserLocation']");
                    const urlEl = document.querySelector("[data-testid='UserUrl']");
                    const joinEl = document.querySelector("[data-testid='UserJoinDate']");
                    const followingEl = document.querySelector("a[href$='/following']");
                    const followersEl = document.querySelector("a[href$='/verified_followers'], a[href$='/followers']");
                    // Scope verified badge check to nameEl ONLY, avoiding navigation sidebar icons
                    const verifiedEl = nameEl
                        ? nameEl.querySelector("[data-testid='icon-verified'], [aria-label*='Verified'], svg[data-testid*='verified']")
                        : null;
                    const handleLine = lines.find((l) => l.startsWith("@"));
                    const handle = handleLine || (lines[1] ? `@${lines[1].replace(/^@/, "")}` : "");
                    const name = lines[0] && !lines[0].startsWith("@") ? lines[0] : "";
                    let fullUrl;
                    if (urlEl) {
                        const a = urlEl.tagName.toLowerCase() === "a"
                            ? urlEl
                            : urlEl.querySelector("a");
                        const titleHref = a ? a.getAttribute("title") : null;
                        const directHref = a ? a.href : null;
                        const textUrl = urlEl.innerText.trim();
                        if (titleHref && titleHref.startsWith("http")) {
                            fullUrl = titleHref;
                        }
                        else if (textUrl && (textUrl.includes(".") || textUrl.startsWith("http"))) {
                            fullUrl = textUrl.startsWith("http") ? textUrl : `https://${textUrl}`;
                        }
                        else if (directHref) {
                            fullUrl = directHref;
                        }
                    }
                    let cleanBio = bioEl ? bioEl.innerText : undefined;
                    if (cleanBio) {
                        cleanBio = cleanBio.replace(/(https?:\/\/)\s+/gi, "$1");
                    }
                    return {
                        hasNameEl: !!nameEl,
                        name,
                        handle,
                        bio: cleanBio,
                        location: locationEl ? locationEl.innerText : undefined,
                        url: fullUrl,
                        joined: joinEl ? joinEl.innerText : undefined,
                        following: followingEl ? followingEl.innerText : undefined,
                        followers: followersEl ? followersEl.innerText : undefined,
                        verified: !!verifiedEl,
                    };
                });
                if (!profileData.hasNameEl || (!profileData.name && !profileData.handle)) {
                    const statusText = await page.evaluate(() => {
                        const emptyEl = document.querySelector("[data-testid='empty_state'], [data-testid='emptyState']");
                        const body = document.body ? document.body.innerText : "";
                        return (emptyEl ? emptyEl.innerText + "\n" : "") + body;
                    });
                    if (/account suspended/i.test(statusText)) {
                        throw new Error(`Twitter user '@${cleanUsername}' is suspended.`);
                    }
                    if (/this account doesn[’']t exist|this page doesn[’']t exist|account doesn[’']t exist/i.test(statusText)) {
                        throw new Error(`Twitter user '@${cleanUsername}' does not exist.`);
                    }
                    throw new Error(`Twitter user '@${cleanUsername}' could not be found or profile failed to load.`);
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
            }
            finally {
                defaultRateLimiter.recordActionCompleted();
            }
        });
    }
}
export const defaultTwitterService = new TwitterService();
//# sourceMappingURL=twitter.js.map