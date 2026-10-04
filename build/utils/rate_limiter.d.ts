export declare class RateLimiter {
    private lastActionTime;
    private minIntervalMs;
    private maxSearchResults;
    private recentActions;
    private maxActionsPerMinute;
    private pacingQueue;
    constructor(options?: {
        minIntervalMs?: number;
        maxSearchResults?: number;
        maxActionsPerMinute?: number;
    });
    clampSearchLimit(limit?: any): number;
    enforcePacing(actionName: string): Promise<void>;
    recordActionCompleted(): void;
    private sleep;
}
export declare const defaultRateLimiter: RateLimiter;
