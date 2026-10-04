import { chromium } from "playwright";
import { loadCookies } from "../utils/cookies.js";
export class BrowserSessionManager {
    browser = null;
    context = null;
    isInitializing = false;
    lockPromise = Promise.resolve();
    cookiesPath;
    constructor(options) {
        this.cookiesPath = options?.cookiesPath;
    }
    async getContext() {
        if (this.context && this.browser && this.browser.isConnected()) {
            return this.context;
        }
        if (this.browser && !this.browser.isConnected()) {
            await this.close();
        }
        if (this.isInitializing) {
            while (this.isInitializing) {
                await new Promise((res) => setTimeout(res, 100));
            }
            if (this.context && this.browser && this.browser.isConnected())
                return this.context;
        }
        this.isInitializing = true;
        try {
            const headless = process.env.TWITTER_HEADLESS !== "false";
            try {
                this.browser = await chromium.launch({
                    headless,
                    channel: "chrome",
                    args: [
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                    ],
                });
            }
            catch (err) {
                console.error(`[browser] Could not launch Chrome channel (${err.message}). Falling back to bundled Chromium.`);
                this.browser = await chromium.launch({
                    headless,
                    args: [
                        "--disable-blink-features=AutomationControlled",
                        "--no-sandbox",
                        "--disable-setuid-sandbox",
                    ],
                });
            }
            this.context = await this.browser.newContext({
                userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
                viewport: { width: 1280, height: 800 },
                deviceScaleFactor: 1,
                locale: "en-US",
            });
            // Load and inject cookies
            const cookies = loadCookies(this.cookiesPath);
            await this.context.addCookies(cookies);
            console.error(`[browser] Injected ${cookies.length} session cookies into browser context.`);
            return this.context;
        }
        catch (err) {
            await this.close();
            throw err;
        }
        finally {
            this.isInitializing = false;
        }
    }
    async withPage(fn) {
        // Acquire sequential lock
        let releaseLock = () => { };
        const previousLock = this.lockPromise;
        this.lockPromise = new Promise((resolve) => {
            releaseLock = resolve;
        });
        // Safely wait for previous lock even if it rejected
        await previousLock.catch(() => { });
        let page = null;
        try {
            const context = await this.getContext();
            page = await context.newPage();
            return await fn(page);
        }
        finally {
            if (page) {
                await page.close().catch(() => { });
            }
            releaseLock();
        }
    }
    async close() {
        if (this.context) {
            await this.context.close().catch(() => { });
            this.context = null;
        }
        if (this.browser) {
            await this.browser.close().catch(() => { });
            this.browser = null;
        }
    }
}
export const defaultSessionManager = new BrowserSessionManager();
// Register cleanup listeners
process.on("exit", () => {
    defaultSessionManager.close().catch(() => { });
});
process.on("SIGINT", () => {
    defaultSessionManager.close().then(() => process.exit(0)).catch(() => process.exit(0));
});
process.on("SIGTERM", () => {
    defaultSessionManager.close().then(() => process.exit(0)).catch(() => process.exit(0));
});
//# sourceMappingURL=session.js.map