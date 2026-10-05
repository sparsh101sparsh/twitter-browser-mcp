# Twitter / X Safe Use and Anti-Termination Guidelines

Operating guidelines and defensive protocols for running the browser-automated Twitter/X MCP server (`twitter-browser-mcp`).

---

## 1. Threat Vectors and Detection Heuristics

Automated interactions on Twitter/X face continuous scrutiny from client-side telemetry, browser fingerprinting, and behavioral heuristic engines (including Arkose Labs and Cloudflare challenge layers). Account termination, shadowbans, and locks are triggered primarily by:

1. **Velocity Anomalies**: Automated tools executing queries in millisecond bursts without human pause times.
2. **Deep Scraping Footprints**: Automated looping or continuous pagination across search results or user follower graphs.
3. **Session Flapping**: Rapidly invalidating cookies, logging in and out repeatedly, or switching IP addresses and VPN regions during a session.
4. **Autonomous Engagement**: Unsolicited mentions, identical duplicated tweet bodies, or automated quote-tweeting.
5. **Captcha/Challenge Resistance**: Automated scripts attempting to click through, bypass, or retry against Arkose Captchas or verification challenge screens.

---

## 2. Operating Principles and Guardrails

### Pacing and Velocity Defense
- **Enforced Delay**: The server includes an internal mutex-based pacing queue enforcing a minimum **2500ms delay** between all automated operations. Do not disable this mechanism.
- **Search Clamping**: Every search request is capped at a maximum of **50 tweets**. Never paginate search queries in automated loops.
- **Turn Limits**: Limit search and profile queries to **2 to 3 actions per conversational turn**.

### Human-in-the-Loop Confirmation
- **Strict Read-Only Default**: Agents using this server must operate in read-only mode for information retrieval (`search_tweets`, `get_profile`).
- **No Autonomous Posting**: `post_tweet` must never be called autonomously. Posting is only permitted when the user explicitly provides the text or media and confirms the post action.
- **Cadence**: Keep automated posts to standard human publishing volumes (1 to 2 posts per session).

### Fail-Fast on Security Checkpoints
If Twitter/X serves any of the following challenge indicators:
- Arkose Captcha (`iframe[src*="arkoselabs"]`)
- Account verification challenge (`/account/access`)
- Two-factor authentication checkpoint (`/account/login_challenge` or `/i/flow/two-factor-auth`)

**The automation halts immediately.** Never script automated challenge bypasses. Open `https://x.com` in a standard desktop browser, complete the security check manually, re-export your session cookies, and resume.

---

## 3. Media Ingestion Constraints

When uploading media files through `post_tweet`:
- **Static Images**: Up to 4 files (`.png`, `.jpg`, `.jpeg`, `.webp`).
- **Videos**: Exactly 1 video file (`.mp4`, `.mov`). The server monitors asynchronous backend transcoding (`upload2.json` STATUS polling) until `processing_info.state === 'succeeded'`. Do not force post submission before transcoding completes.
- **GIFs**: Exactly 1 animated GIF file (`.gif`). Never combine animated GIFs with static images or video files.
- **File Validation**: Zero-byte files or corrupted video headers are rejected prior to browser injection.

---

## 4. Session Cookie Hygiene

1. Store exported session cookies (`x_com_cookies.json`) in a local protected directory with restricted permissions (`chmod 600`).
2. Never commit cookie files or session secrets to public version control repositories (`.gitignore` protects cookie filenames by default).
3. Do not run automated sessions through commercial datacenter proxies or aggressive VPN rotations, which trigger immediate bot flags on X.
4. If a session expires or Twitter prompts for re-authentication, simply re-export fresh cookies from your active desktop browser.
