import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RateLimiter } from "../build/utils/rate_limiter.js";

describe("RateLimiter and Pacing", () => {
  test("clamps search limit to maximum safe limit (50)", () => {
    const limiter = new RateLimiter({ maxSearchResults: 50 });
    assert.equal(limiter.clampSearchLimit(10), 10);
    assert.equal(limiter.clampSearchLimit(50), 50);
    assert.equal(limiter.clampSearchLimit(100), 50);
    assert.equal(limiter.clampSearchLimit(Infinity), 50);
    assert.equal(limiter.clampSearchLimit(0), 10);
    assert.equal(limiter.clampSearchLimit(-5), 10);
    assert.equal(limiter.clampSearchLimit(NaN), 10);
    assert.equal(limiter.clampSearchLimit(25.8), 25);
    assert.equal(limiter.clampSearchLimit(undefined), 10);
  });

  test("enforces pacing delay between rapid actions", async () => {
    const limiter = new RateLimiter({ minIntervalMs: 150 });
    const start = Date.now();
    await limiter.enforcePacing("action1");
    await limiter.enforcePacing("action2");
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 140, `Elapsed time should be at least ~150ms, was ${elapsed}ms`);
  });
});
