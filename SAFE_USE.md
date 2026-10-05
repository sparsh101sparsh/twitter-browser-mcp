# 🛡️ Twitter / X Safe Use & Account Protection Guidelines

Operating guidelines and safety rules for using **`twitter-browser-mcp`** to prevent account flags, temporary suspensions, or termination.

---

## 1. Safety Rules & Behavioral Guardrails

### ⏱️ Pacing & Rate Limits
- **Delay Between Actions**: The server enforces a minimum **2500ms delay** between consecutive requests. Do not disable or bypass this pacing.
- **Search Clamping**: Maximum **50 tweets** per query. Avoid automated looping or scraping deeply through paginated results.
- **Turn Bounds**: Run at most **2–3 searches** per task to simulate genuine human querying behavior.

### ✍️ Safe Posting Rules
- **Human-in-the-Loop Confirmation**: Only post when explicitly initiated by the user. Do not program agents to auto-reply or bulk-tweet autonomously.
- **Natural Frequency**: Keep automated posting to normal human cadences (1–2 tweets in a working session).
- **Anti-Spam Discipline**: Avoid spamming repeated hashtags or tagging multiple random `@mentions`.

### 🚨 Fail-Fast on Security Challenges
If Twitter triggers a security checkpoint:
- Arkose Captcha
- Email/SMS verification challenge (`/account/access`, `/account/login_challenge`)
- Suspicious activity warning

> **RULE**: **Stop automation immediately.** Never attempt to programmatically bypass a captcha or challenge. Open [x.com](https://x.com) in your regular desktop browser, complete the verification manually, and wait before resuming automation.

---

## 2. Media Upload Guidelines

- **Images**: Max 4 static images (`.png`, `.jpg`, `.jpeg`, `.webp`).
- **Videos**: Max 1 video (`.mp4`, `.mov`). The MCP server automatically detects and waits for Twitter's backend transcoding (`processing_info.state === 'succeeded'`) before submitting.
- **GIFs**: Max 1 animated GIF (`.gif`). Never combine a GIF with images or videos (enforced by Twitter).

---

## 3. Session & Cookie Hygiene

- Exported cookies (`x_com_cookies.json`) should be stored locally and kept private.
- **Never commit `x_com_cookies.json` to GitHub** (it is protected in `.gitignore`).
- If Twitter logs you out or your session expires, simply re-export fresh cookies from your browser DevTools.
