import { test, describe } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { validateMediaPaths } from "../build/services/media.js";

describe("Media and Input Validation", () => {
  const imgPath = path.resolve("fixtures/test_image.png");
  const vidPath = path.resolve("fixtures/test_video.mp4");

  test("handles empty media list", () => {
    const res = validateMediaPaths([]);
    assert.deepEqual(res.resolvedPaths, []);
    assert.equal(res.hasImage, false);
    assert.equal(res.hasVideo, false);
  });

  test("validates single image attachment", () => {
    const res = validateMediaPaths([imgPath]);
    assert.equal(res.resolvedPaths.length, 1);
    assert.equal(res.hasImage, true);
    assert.equal(res.hasVideo, false);
  });

  test("validates single video attachment", () => {
    const res = validateMediaPaths([vidPath]);
    assert.equal(res.resolvedPaths.length, 1);
    assert.equal(res.hasImage, false);
    assert.equal(res.hasVideo, true);
  });

  test("rejects non-existent file", () => {
    assert.throws(
      () => validateMediaPaths(["fixtures/does_not_exist.png"]),
      /Media file does not exist/
    );
  });

  test("rejects unsupported file extension", () => {
    assert.throws(
      () => validateMediaPaths(["package.json"]),
      /Unsupported media format/
    );
  });

  test("rejects combining image and video", () => {
    assert.throws(
      () => validateMediaPaths([imgPath, vidPath]),
      /does not allow attaching videos and images/i
    );
  });

  test("rejects more than 1 video", () => {
    assert.throws(
      () => validateMediaPaths([vidPath, vidPath]),
      /only supports 1 video/i
    );
  });

  test("validates multi-image attachments up to 4", () => {
    const res2 = validateMediaPaths([imgPath, imgPath]);
    assert.equal(res2.resolvedPaths.length, 2);
    assert.equal(res2.hasImage, true);
    assert.equal(res2.hasVideo, false);

    const res4 = validateMediaPaths([imgPath, imgPath, imgPath, imgPath]);
    assert.equal(res4.resolvedPaths.length, 4);
    assert.equal(res4.hasImage, true);
    assert.equal(res4.hasVideo, false);
  });

  test("rejects invalid path types", () => {
    assert.throws(() => validateMediaPaths([null]), /Invalid media path entry/);
    assert.throws(() => validateMediaPaths([123]), /Invalid media path entry/);
  });

  test("rejects more than 4 images", () => {
    assert.throws(
      () => validateMediaPaths([imgPath, imgPath, imgPath, imgPath, imgPath]),
      /maximum of 4 image attachments/i
    );
  });
});
