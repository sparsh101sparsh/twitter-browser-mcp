# Original User Request

## 2026-10-04T22:05:09Z

This is a single self-contained fix; keep it small and focused.

Build a local, lightweight browser-automated Twitter/X MCP server that operates through a live, logged-in browser session (using Playwright or Puppeteer) to post tweets, upload media (images, GIFs, and videos), and perform search/reads without requiring official Twitter Developer API keys or paid tiers.

Working directory: ~/teamwork_projects/twitter_browser_mcp
Integrity mode: demo

## Requirements

### R1. MCP Server Protocol Implementation
The server must implement the Model Context Protocol (stdio transport) providing:
- `post_tweet`: Posts text content with optional media attachments (`media_paths` supporting PNG, JPG, MP4, MOV, GIF).
- `search_tweets`: Performs keyword/hashtag searches and returns formatted results.
- `get_profile`: Fetches public profile details.

### R2. Browser Session & Media Upload Engine
Use browser automation (Playwright/Puppeteer) utilizing cookies from `~/Downloads/x_com_cookies.json` or attaching to local browser session:
- Handle Twitter's file input interface for images and videos.
- Reliably detect upload progress and wait for Twitter's backend video processing to complete before clicking the post button.
- Handle compose modals, character validation, and inline posting buttons.

### R3. Rate Limiting and Safety Guardrails
Adhere to the `twitter-safe-use` hygiene rules:
- Max 50 search results per call.
- Pacing safeguards to prevent rapid bursts.
- Graceful error detection (e.g., account lock, challenge, captcha) that alerts the user without recursive retries.

## Acceptance Criteria

### Functional Verification
- [ ] An MCP client can connect via stdio and discover `post_tweet` and `search_tweets` tools.
- [ ] Programmatic execution of `post_tweet` with plain text successfully creates a tweet on X.
- [ ] Programmatic execution of `post_tweet` with a video/image path correctly attaches the media, waits for encoding, and posts.
- [ ] End-to-end test script verifies the posting flow without manual browser intervention.
