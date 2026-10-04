import type { PlaywrightCookie } from "../types.js";
export declare function expandHome(filepath: string): string;
export declare function getDefaultCookiePath(): string;
export declare function normalizeCookies(rawCookies: any[]): PlaywrightCookie[];
export interface CookieValidationResult {
    valid: boolean;
    missing: string[];
    expired: string[];
}
export declare function validateCookies(cookies: PlaywrightCookie[]): CookieValidationResult;
export declare function loadCookies(customPath?: string): PlaywrightCookie[];
