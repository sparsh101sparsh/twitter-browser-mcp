import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PlaywrightCookie } from "../types.js";

export function expandHome(filepath: string): string {
  if (filepath === "~") return os.homedir();
  if (filepath.startsWith("~/") || filepath.startsWith("~\\")) {
    return path.join(os.homedir(), filepath.slice(2));
  }
  return filepath;
}

export function getDefaultCookiePath(): string {
  const p = process.env.TWITTER_COOKIES_PATH || path.join(os.homedir(), "Downloads", "x_com_cookies.json");
  return expandHome(p);
}

export function normalizeCookies(rawCookies: any[]): PlaywrightCookie[] {
  if (!Array.isArray(rawCookies)) {
    throw new Error("Cookies file must contain a JSON array of cookie objects");
  }

  return rawCookies
    .filter((c) => c && typeof c === "object" && typeof c.name === "string" && typeof c.value === "string")
    .map((c) => {
      const cookie: PlaywrightCookie = {
        name: c.name,
        value: c.value,
        domain: c.domain || ".x.com",
        path: c.path || "/",
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
      };

      if (c.expirationDate && !c.session) {
        cookie.expires = Number(c.expirationDate);
      }

      if (c.sameSite && typeof c.sameSite === "string") {
        const s = c.sameSite.toLowerCase();
        if (s === "no_restriction" || s === "none") {
          cookie.sameSite = "None";
        } else if (s === "lax") {
          cookie.sameSite = "Lax";
        } else if (s === "strict") {
          cookie.sameSite = "Strict";
        }
      }

      return cookie;
    });
}

export interface CookieValidationResult {
  valid: boolean;
  missing: string[];
  expired: string[];
}

export function validateCookies(cookies: PlaywrightCookie[]): CookieValidationResult {
  const nowSec = Date.now() / 1000;
  const cookieMap = new Map(cookies.map((c) => [c.name, c]));
  const required = ["auth_token", "ct0"];
  const missing = required.filter((name) => !cookieMap.has(name));
  const expired: string[] = [];

  for (const name of required) {
    const c = cookieMap.get(name);
    if (c && c.expires !== undefined && c.expires < nowSec) {
      expired.push(name);
    }
  }

  return {
    valid: missing.length === 0 && expired.length === 0,
    missing,
    expired,
  };
}

export function loadCookies(customPath?: string): PlaywrightCookie[] {
  const targetPath = expandHome(customPath || getDefaultCookiePath());

  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `Twitter cookies file not found at: ${targetPath}. Please provide cookies exported from a logged-in Twitter/X session.`
    );
  }

  let content: string;
  try {
    content = fs.readFileSync(targetPath, "utf-8");
  } catch (err: any) {
    throw new Error(`Failed to read cookies file at ${targetPath}: ${err.message}`);
  }

  let parsed: any;
  try {
    parsed = JSON.parse(content);
  } catch (err: any) {
    throw new Error(`Failed to parse cookies JSON from ${targetPath}: ${err.message}`);
  }

  const normalized = normalizeCookies(parsed);
  const validation = validateCookies(normalized);
  if (!validation.valid) {
    const problems: string[] = [];
    if (validation.missing.length > 0) {
      problems.push(`missing required auth cookies (${validation.missing.join(", ")})`);
    }
    if (validation.expired.length > 0) {
      problems.push(`expired auth cookies (${validation.expired.join(", ")})`);
    }
    console.error(`[warning] Cookies validation issue: ${problems.join(", ")}`);
    if (validation.missing.includes("auth_token") || validation.expired.includes("auth_token")) {
      throw new Error(
        `Twitter auth cookie 'auth_token' is ${
          validation.missing.includes("auth_token") ? "missing" : "expired"
        }. Please re-export cookies from a logged-in Twitter/X session.`
      );
    }
  }

  return normalized;
}
