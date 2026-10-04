import { test, describe, after } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { defaultTwitterService } from "../build/services/twitter.js";
import { defaultSessionManager } from "../build/browser/session.js";

describe("Live Twitter E2E Verification", () => {
  after(async () => {
    await defaultSessionManager.close();
  });

  test("getProfile fetches user profile details", async () => {
    const profile = await defaultTwitterService.getProfile({ username: "issparssh" });
    console.log("Profile fetched:", profile);
    assert.ok(profile.username);
    assert.equal(profile.username.toLowerCase(), "issparssh");
    assert.ok(profile.profile_url);
  });

  test("searchTweets returns formatted search results", async () => {
    const results = await defaultTwitterService.searchTweets({ query: "AI", limit: 3 });
    console.log(`Found ${results.tweets.length} search results`);
    assert.ok(Array.isArray(results.tweets));
    assert.ok(results.count >= 0);
  });

  test("postTweet with plain text successfully creates a tweet", async () => {
    const uniqueText = `Automated MCP Plain Text: ${Date.now()}`;
    const result = await defaultTwitterService.postTweet({ text: uniqueText });
    console.log("Plain text post result:", result);
    assert.equal(result.status, "success");
    assert.ok(result.message.includes("successfully"));
  });

  test("postTweet with image media attachment successfully creates a tweet", async () => {
    const imgPath = path.resolve("fixtures/test_image.png");
    const uniqueText = `Automated MCP Image Post: ${Date.now()}`;
    const result = await defaultTwitterService.postTweet({
      text: uniqueText,
      media_paths: [imgPath],
    });
    console.log("Image post result:", result);
    assert.equal(result.status, "success");
    assert.equal(result.media_count, 1);
  });

  test("postTweet with video media attachment successfully encodes and posts", async () => {
    const vidPath = path.resolve("fixtures/test_video.mp4");
    const uniqueText = `Automated MCP Video Post: ${Date.now()}`;
    const result = await defaultTwitterService.postTweet({
      text: uniqueText,
      media_paths: [vidPath],
    });
    console.log("Video post result:", result);
    assert.equal(result.status, "success");
    assert.equal(result.media_count, 1);
  });
});
