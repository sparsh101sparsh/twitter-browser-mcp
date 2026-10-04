import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import type { PlaywrightCookie } from "../types.js";

export function getDefaultCookiePath(): string {
  return process.env.TWITTER_COOKIES_PATH || path.join(os.homedir(), "Downloads", "x_com_cookies.json");
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
        domain: c.domain,
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

export function validateCookies(cookies: PlaywrightCookie[]): { valid: boolean; missing: string[] } {
  const cookieNames = new Set(cookies.map((c) => c.name));
  const required = ["auth_token", "ct0"];
  const missing = required.filter((name) => !cookieNames.has(name));

  return {
    valid: missing.length === 0,
    missing,
  };
}

export function loadCookies(customPath?: string): PlaywrightCookie[] {
  const targetPath = customPath || getDefaultCookiePath();

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
    console.error(
      `[warning] Cookies file is missing essential auth cookies: ${validation.missing.join(", ")}. Session may not be authenticated.`
    );
  }

  return normalized;
}
