import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { checkSecurityChallenges, TwitterSafetyError } from "../build/browser/guardrails.js";

describe("Guardrails Security Challenges", () => {
  test("detects account access lock URL", async () => {
    const mockPage = {
      url: () => "https://x.com/account/access",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkSecurityChallenges(mockPage),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "ACCOUNT_LOCKED");
        return true;
      }
    );
  });

  test("detects login challenge checkpoint URL", async () => {
    const mockPage = {
      url: () => "https://x.com/account/login_challenge",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkSecurityChallenges(mockPage),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "LOGIN_CHALLENGE");
        return true;
      }
    );
  });

  test("detects unauthenticated login flow URL", async () => {
    const mockPage = {
      url: () => "https://x.com/i/flow/login",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkSecurityChallenges(mockPage),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "UNAUTHENTICATED_SESSION");
        return true;
      }
    );

    const mockPage2 = {
      url: () => "https://x.com/login",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkSecurityChallenges(mockPage2),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "UNAUTHENTICATED_SESSION");
        return true;
      }
    );
  });

  test("detects login verification 2FA URL", async () => {
    const mockPage = {
      url: () => "https://x.com/account/login_verification",
      evaluate: async () => "",
      $: async () => null,
    };

    await assert.rejects(
      async () => checkSecurityChallenges(mockPage),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "LOGIN_CHALLENGE");
        return true;
      }
    );
  });

  test("detects Arkose captcha iframe", async () => {
    const mockPage = {
      url: () => "https://x.com/home",
      evaluate: async () => "Welcome to X",
      $: async (selector) => {
        if (selector.includes("arkoselabs")) return {};
        return null;
      },
    };

    await assert.rejects(
      async () => checkSecurityChallenges(mockPage),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "CAPTCHA_CHALLENGE");
        return true;
      }
    );
  });

  test("detects checkpoint and confirm_password URLs", async () => {
    const mockPage1 = {
      url: () => "https://x.com/i/flow/checkpoint",
      evaluate: async () => "",
      $: async () => null,
    };
    await assert.rejects(
      async () => checkSecurityChallenges(mockPage1),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "LOGIN_CHALLENGE");
        return true;
      }
    );

    const mockPage2 = {
      url: () => "https://x.com/account/confirm_password",
      evaluate: async () => "",
      $: async () => null,
    };
    await assert.rejects(
      async () => checkSecurityChallenges(mockPage2),
      (err) => {
        assert.ok(err instanceof TwitterSafetyError);
        assert.equal(err.code, "LOGIN_CHALLENGE");
        return true;
      }
    );
  });

  test("passes on clean URL and page", async () => {
    const mockPage = {
      url: () => "https://x.com/home",
      evaluate: async () => "Home feed content",
      $: async () => null,
    };

    await assert.doesNotReject(async () => checkSecurityChallenges(mockPage));
  });
});
