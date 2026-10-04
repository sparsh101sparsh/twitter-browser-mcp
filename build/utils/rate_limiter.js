export class RateLimiter {
    lastActionTime = 0;
    minIntervalMs;
    maxSearchResults;
    recentActions = [];
    maxActionsPerMinute;
    constructor(options) {
        this.minIntervalMs = options?.minIntervalMs ?? Number(process.env.TWITTER_PACING_MS || 2500);
        this.maxSearchResults = options?.maxSearchResults ?? 50;
        this.maxActionsPerMinute = options?.maxActionsPerMinute ?? 12;
    }
    clampSearchLimit(limit) {
        const defaultLimit = 10;
        if (limit === undefined || limit === null || isNaN(limit)) {
            return defaultLimit;
        }
        const val = Math.floor(limit);
        if (val <= 0)
            return defaultLimit;
        if (val > this.maxSearchResults) {
            console.error(`[rate_limiter] Requested search limit (${val}) exceeds maximum safe limit (${this.maxSearchResults}). Clamping to ${this.maxSearchResults}.`);
            return this.maxSearchResults;
        }
        return val;
    }
    async enforcePacing(actionName) {
        const now = Date.now();
        // Clean up actions older than 60 seconds
        this.recentActions = this.recentActions.filter((t) => now - t < 60000);
        if (this.recentActions.length >= this.maxActionsPerMinute) {
            const oldestInWindow = this.recentActions[0];
            const waitTime = 60000 - (now - oldestInWindow) + 500;
            console.error(`[rate_limiter] High action frequency detected (${this.recentActions.length} in 60s). Pacing pause: ${Math.round(waitTime / 1000)}s for action '${actionName}'`);
            await this.sleep(waitTime);
        }
        const elapsed = Date.now() - this.lastActionTime;
        if (elapsed < this.minIntervalMs) {
            const waitMs = this.minIntervalMs - elapsed;
            console.error(`[rate_limiter] Pacing gap for ${actionName}: waiting ${waitMs}ms`);
            await this.sleep(waitMs);
        }
        this.lastActionTime = Date.now();
        this.recentActions.push(this.lastActionTime);
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
}
export const defaultRateLimiter = new RateLimiter();
//# sourceMappingURL=rate_limiter.js.map