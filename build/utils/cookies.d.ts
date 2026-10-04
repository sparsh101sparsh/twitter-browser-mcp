import type { PlaywrightCookie } from "../types.js";
export declare function getDefaultCookiePath(): string;
export declare function normalizeCookies(rawCookies: any[]): PlaywrightCookie[];
export declare function validateCookies(cookies: PlaywrightCookie[]): {
    valid: boolean;
    missing: string[];
};
export declare function loadCookies(customPath?: string): PlaywrightCookie[];
