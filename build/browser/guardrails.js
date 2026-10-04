export class TwitterSafetyError extends Error {
    code;
    url;
    constructor(message, code, url) {
        super(message);
        this.name = "TwitterSafetyError";
        this.code = code;
        this.url = url;
    }
}
export async function checkSecurityChallenges(page) {
    const currentUrl = page.url();
    // 1. URL pattern checks
    if (currentUrl.includes("/account/access")) {
        throw new TwitterSafetyError(`Account lock detected (navigated to ${currentUrl}). Halting immediately per twitter-safe-use rules. Open Twitter/X in a regular desktop browser to unlock your account.`, "ACCOUNT_LOCKED", currentUrl);
    }
    if (currentUrl.includes("/account/login_challenge") || currentUrl.includes("/i/flow/login")) {
        throw new TwitterSafetyError(`Login checkpoint / security challenge detected at ${currentUrl}. Halting immediately per twitter-safe-use rules. Complete the challenge in a regular desktop browser.`, "LOGIN_CHALLENGE", currentUrl);
    }
    if (currentUrl.includes("/account/suspended")) {
        throw new TwitterSafetyError(`Account suspended page detected at ${currentUrl}. Halting immediately per twitter-safe-use rules.`, "ACCOUNT_SUSPENDED", currentUrl);
    }
    // 2. DOM / Body content checks
    try {
        const pageText = await page.evaluate(() => {
            return document.body ? document.body.innerText.substring(0, 1500) : "";
        });
        if (/your account has been locked/i.test(pageText)) {
            throw new TwitterSafetyError(`Account lock detected in page text. Halting immediately per twitter-safe-use rules. Open Twitter/X in a regular desktop browser.`, "ACCOUNT_LOCKED", currentUrl);
        }
        if (/suspicious activity/i.test(pageText) || /verify your phone/i.test(pageText)) {
            throw new TwitterSafetyError(`Security verification prompt detected in page text. Halting immediately per twitter-safe-use rules.`, "SECURITY_VERIFICATION", currentUrl);
        }
        if (/rate limit exceeded/i.test(pageText)) {
            throw new TwitterSafetyError(`Twitter rate limit encountered on page ${currentUrl}. Halting operation to prevent account flagging.`, "RATE_LIMITED", currentUrl);
        }
        // Check for Arkose Captcha iframe
        const hasCaptcha = await page.$("iframe[src*='arkoselabs'], iframe[src*='funcaptcha']");
        if (hasCaptcha) {
            throw new TwitterSafetyError(`Arkose Captcha challenge detected on ${currentUrl}. Automated bypass is prohibited by twitter-safe-use. Complete the challenge in a desktop browser.`, "CAPTCHA_CHALLENGE", currentUrl);
        }
    }
    catch (err) {
        if (err instanceof TwitterSafetyError) {
            throw err;
        }
        // Context or evaluation error, ignore if page is navigating
    }
}
//# sourceMappingURL=guardrails.js.map