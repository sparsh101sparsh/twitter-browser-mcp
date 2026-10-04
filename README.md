# Twitter / X Browser MCP Server

A local, lightweight browser-automated Twitter/X Model Context Protocol (MCP) server that operates through a live, logged-in browser session using Playwright and session cookies. Allows posting tweets, uploading media (images, GIFs, videos with backend encoding wait), and performing search/profile reads without requiring official Twitter Developer API keys or paid tiers.

## Features

### 1. Model Context Protocol (MCP) stdio Transport
Implements the standard MCP specification over stdio:
- `post_tweet`: Post text tweets with optional media attachments (`media_paths` supporting PNG, JPG, MP4, MOV, GIF, WEBP).
- `search_tweets`: Keyword/hashtag search with structured result extraction (`live` or `top`).
- `get_profile`: Fetches public profile details (bio, following, followers, verification, join date).

### 2. Browser Automation & Media Upload Engine
- Automated via Playwright with session cookie injection from `~/Downloads/x_com_cookies.json` or custom path.
- Handles Twitter's file input interface (`input[data-testid="fileInput"]`).
- **Video processing detection**: Listens to Twitter backend upload events (`INIT`, `APPENDMULTI`, `FINALIZE`, `STATUS`) and monitors UI progress indicators to ensure videos finish encoding before posting.
- Validates tweet character limits (280 characters by default, with `allow_long_tweet` bypass for X Premium).

### 3. Safety Guardrails & Rate Limiting (`twitter-safe-use`)
- **Query limits**: Search results are capped at a maximum of 50 tweets per call.
- **Pacing safeguards**: Enforces spacing between actions (default 2500ms) and limits burst actions to avoid Twitter rate limits.
- **Graceful error detection**: Detects account lock (`/account/access`), login challenges (`/account/login_challenge`), suspension, and Arkose Captchas, immediately stopping execution without recursive retries.
- **Credential hygiene**: Sensitive cookies and tokens are never printed to stdout or returned in tool results.

---

## Configuration

| Environment Variable | Default | Description |
|---|---|---|
| `TWITTER_COOKIES_PATH` | `~/Downloads/x_com_cookies.json` | Path to JSON file exported from browser session |
| `TWITTER_HEADLESS` | `true` | Set to `false` to run browser in visible mode |
| `TWITTER_PACING_MS` | `2500` | Minimum delay in milliseconds between automated actions |

---

## MCP Tools Reference

### `post_tweet`
Posts a new tweet with optional media attachments.
- `text` *(string, optional)*: Tweet text content (up to 280 characters by default).
- `media_paths` *(string[], optional)*: Array of local file paths (PNG, JPG, MP4, MOV, GIF, WEBP). Max 4 images or 1 video.
- `allow_long_tweet` *(boolean, optional)*: Set to true if the account is X Premium and allows > 280 characters.

### `search_tweets`
Searches tweets by keyword or hashtag.
- `query` *(string, required)*: Keyword, hashtag, or query.
- `limit` *(number, optional, default: 10, max: 50)*: Number of tweets to retrieve.
- `mode` *(string, optional, default: "live")*: `"live"` for real-time tweets, `"top"` for popular tweets.

### `get_profile`
Fetches profile information for a user.
- `username` *(string, required)*: Handle with or without `@`.

---

## Installation & Build

```bash
npm install
npm run build
```

## Running the Server

```bash
# Direct execution (stdio)
npm start

# Or using the binary directly
./build/index.js
```

## Testing

```bash
# Run unit & MCP protocol discovery tests
npm run test:unit

# Run full live E2E verification (requires cookies in ~/Downloads/x_com_cookies.json)
npm run test:e2e
```
