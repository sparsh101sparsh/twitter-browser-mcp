import type { Page } from "playwright";
export declare class TwitterSafetyError extends Error {
    readonly code: string;
    readonly url: string;
    constructor(message: string, code: string, url: string);
}
export declare function checkSecurityChallenges(page: Page): Promise<void>;
