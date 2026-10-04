import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { attachMediaAndWait } from "../build/services/media.js";

describe("Media Upload Engine and Async Video Finalization", () => {
  const vidPath = path.resolve("fixtures/test_video.mp4");

  test("does NOT resolve prematurely on command=INIT and waits for command=FINALIZE", async () => {
    let responseCallback = null;
    let setInputFilesCalled = false;
    let isFinalizedSent = false;

    // Create a mock page
    const mockPage = {
      on: (event, cb) => {
        if (event === "response") responseCallback = cb;
      },
      off: () => {},
      locator: (selector) => {
        const item = {
          waitFor: async () => {},
          setInputFiles: async () => {
            setInputFilesCalled = true;
            // Simulate Twitter responding with command=INIT shortly after setInputFiles
            setTimeout(async () => {
              if (responseCallback) {
                await responseCallback({
                  url: () => "https://upload.twitter.com/1.1/media/upload.json?command=INIT",
                  request: () => ({
                    url: () => "https://upload.twitter.com/1.1/media/upload.json?command=INIT",
                    postData: () => "command=INIT&media_type=video%2Fmp4",
                  }),
                  status: () => 200,
                  text: async () =>
                    JSON.stringify({
                      media_id: 11223344,
                      media_id_string: "11223344",
                      size: 50000,
                      expires_after_secs: 86400,
                    }),
                });
              }
            }, 50);

            // Simulate Twitter responding with command=FINALIZE after 300ms
            setTimeout(async () => {
              isFinalizedSent = true;
              if (responseCallback) {
                await responseCallback({
                  url: () => "https://upload.twitter.com/1.1/media/upload.json?command=FINALIZE",
                  request: () => ({
                    url: () => "https://upload.twitter.com/1.1/media/upload.json?command=FINALIZE",
                    postData: () => "command=FINALIZE&media_id=11223344",
                  }),
                  status: () => 200,
                  text: async () =>
                    JSON.stringify({
                      media_id: 11223344,
                      media_id_string: "11223344",
                      processing_info: { state: "succeeded" },
                    }),
                });
              }
            }, 300);
          },
          isVisible: async () => true,
          getAttribute: async (attr) => (attr === "aria-disabled" ? "false" : null),
          innerText: async () => "",
          first: () => item,
          locator: () => item,
        };
        return item;
      },
      $: async (selector) => {
        // Return video element in DOM so hasVideoPreview is true
        if (selector === "video") return {};
        return null;
      },
      $$: async () => [],
      waitForTimeout: async (ms) => new Promise((res) => setTimeout(res, ms)),
    };

    const startTime = Date.now();
    await attachMediaAndWait(mockPage, [vidPath], 5000);
    const elapsed = Date.now() - startTime;

    assert.ok(setInputFilesCalled, "setInputFiles should have been called");
    assert.ok(isFinalizedSent, "FINALIZE response must have been sent before attachMediaAndWait resolved");
    assert.ok(
      elapsed >= 280,
      `attachMediaAndWait should wait for FINALIZE (>280ms), but finished in ${elapsed}ms`
    );
  });

  test("immediately throws when Twitter backend returns media validation error", async () => {
    let responseCallback = null;

    const mockPage = {
      on: (event, cb) => {
        if (event === "response") responseCallback = cb;
      },
      off: () => {},
      locator: () => ({
        first: () => ({
          waitFor: async () => {},
          setInputFiles: async () => {
            setTimeout(async () => {
              if (responseCallback) {
                await responseCallback({
                  url: () => "https://upload.twitter.com/1.1/media/upload.json",
                  request: () => ({
                    url: () => "https://upload.twitter.com/1.1/media/upload.json",
                    postData: () => "command=INIT",
                  }),
                  status: () => 400,
                  text: async () =>
                    JSON.stringify({
                      errors: [{ code: 324, message: "The validation of media failed." }],
                    }),
                });
              }
            }, 50);
          },
          isVisible: async () => false,
          getAttribute: async () => "true",
          innerText: async () => "",
        }),
      }),
      $: async () => null,
      $$: async () => [],
      waitForTimeout: async (ms) => new Promise((res) => setTimeout(res, ms)),
    };

    await assert.rejects(
      async () => attachMediaAndWait(mockPage, [vidPath], 5000),
      /The validation of media failed/
    );
  });
});
