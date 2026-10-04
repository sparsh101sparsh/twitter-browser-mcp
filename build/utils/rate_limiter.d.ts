export declare class RateLimiter {
    private lastActionTime;
    private minIntervalMs;
    private maxSearchResults;
    private recentActions;
    private maxActionsPerMinute;
    constructor(options?: {
        minIntervalMs?: number;
        maxSearchResults?: number;
        maxActionsPerMinute?: number;
    });
    clampSearchLimit(limit?: number): number;
    enforcePacing(actionName: string): Promise<void>;
    private sleep;
}
export declare const defaultRateLimiter: RateLimiter;
