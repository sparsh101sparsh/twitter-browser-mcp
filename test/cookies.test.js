import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { normalizeCookies, validateCookies, loadCookies } from "../build/utils/cookies.js";

describe("Cookies utility", () => {
  test("normalizes raw Chrome cookie objects", () => {
    const raw = [
      {
        name: "auth_token",
        value: "secret_token",
        domain: ".x.com",
        path: "/",
        expirationDate: 1800000000,
        httpOnly: true,
        secure: true,
        sameSite: "no_restriction",
        session: false,
      },
      {
        name: "ct0",
        value: "csrf_token",
        domain: ".x.com",
        path: "/",
        sameSite: "lax",
      },
    ];

    const normalized = normalizeCookies(raw);
    assert.equal(normalized.length, 2);

    assert.equal(normalized[0].name, "auth_token");
    assert.equal(normalized[0].value, "secret_token");
    assert.equal(normalized[0].domain, ".x.com");
    assert.equal(normalized[0].httpOnly, true);
    assert.equal(normalized[0].secure, true);
    assert.equal(normalized[0].expires, 1800000000);
    assert.equal(normalized[0].sameSite, "None");

    assert.equal(normalized[1].name, "ct0");
    assert.equal(normalized[1].sameSite, "Lax");
  });

  test("validates required auth cookies", () => {
    const validCookies = [
      { name: "auth_token", value: "a" },
      { name: "ct0", value: "b" },
    ];
    const validation = validateCookies(validCookies);
    assert.equal(validation.valid, true);
    assert.equal(validation.missing.length, 0);
    assert.equal(validation.expired.length, 0);

    const missingCookies = [{ name: "auth_token", value: "a" }];
    const invalidValidation = validateCookies(missingCookies);
    assert.equal(invalidValidation.valid, false);
    assert.deepEqual(invalidValidation.missing, ["ct0"]);

    const expiredCookies = [
      { name: "auth_token", value: "a", expires: 1000 },
      { name: "ct0", value: "b", expires: 2000000000 },
    ];
    const expiredValidation = validateCookies(expiredCookies);
    assert.equal(expiredValidation.valid, false);
    assert.deepEqual(expiredValidation.expired, ["auth_token"]);
  });

  test("supplies default domain if omitted", () => {
    const raw = [{ name: "foo", value: "bar" }];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized[0].domain, ".x.com");
  });

  test("maps twitter.com domains to x.com", () => {
    const raw = [
      { name: "auth_token", value: "tok", domain: ".twitter.com" },
      { name: "ct0", value: "csrf", domain: "twitter.com" },
    ];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized[0].domain, ".x.com");
    assert.equal(normalized[1].domain, "x.com");
  });

  test("supports expires and expiry property aliases", () => {
    const raw = [
      { name: "auth_token", value: "tok", expires: 1900000000 },
      { name: "ct0", value: "csrf", expiry: 1900000000 },
    ];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized[0].expires, 1900000000);
    assert.equal(normalized[1].expires, 1900000000);
  });

  test("parses ISO date strings and converts millisecond timestamps", () => {
    const raw = [
      { name: "auth_token", value: "tok", expires: "2028-01-01T00:00:00.000Z" },
      { name: "ct0", value: "csrf", expires: 1893456000000 }, // ms
    ];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized[0].expires, Math.floor(Date.parse("2028-01-01T00:00:00.000Z") / 1000));
    assert.equal(normalized[1].expires, 1893456000);
  });

  test("enforces secure=true for SameSite=None and filters empty cookie values", () => {
    const raw = [
      { name: "auth_token", value: "tok", sameSite: "none", secure: false },
      { name: "empty_val", value: "   " },
      { name: "   ", value: "empty_name" },
    ];
    const normalized = normalizeCookies(raw);
    assert.equal(normalized.length, 1);
    assert.equal(normalized[0].name, "auth_token");
    assert.equal(normalized[0].sameSite, "None");
    assert.equal(normalized[0].secure, true);
  });

  test("loads cookies from the default path", () => {
    const cookies = loadCookies();
    assert.ok(cookies.length > 0, "Should load at least one cookie");
    const val = validateCookies(cookies);
    assert.ok(val.valid, "Default cookies file should have valid auth_token and ct0");
  });
});
