import { type BrowserContext, type Page } from "playwright";
export declare class BrowserSessionManager {
    private browser;
    private context;
    private isInitializing;
    private lockPromise;
    private cookiesPath?;
    constructor(options?: {
        cookiesPath?: string;
    });
    getContext(): Promise<BrowserContext>;
    withPage<T>(fn: (page: Page) => Promise<T>): Promise<T>;
    close(): Promise<void>;
}
export declare const defaultSessionManager: BrowserSessionManager;
