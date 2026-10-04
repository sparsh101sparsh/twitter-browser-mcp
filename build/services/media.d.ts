import type { Page } from "playwright";
export interface ValidatedMedia {
    resolvedPaths: string[];
    hasVideo: boolean;
    hasImage: boolean;
    hasGif: boolean;
}
export declare function validateMediaPaths(mediaPaths?: string[]): ValidatedMedia;
export declare function attachMediaAndWait(page: Page, mediaPaths: string[], timeoutMs?: number): Promise<void>;
