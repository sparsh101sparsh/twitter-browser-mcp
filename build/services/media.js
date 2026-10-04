import fs from "node:fs";
import path from "node:path";
import { expandHome } from "../utils/cookies.js";
const SUPPORTED_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const SUPPORTED_VIDEO_EXTS = new Set([".mp4", ".mov"]);
export function validateMediaPaths(mediaPaths) {
    if (mediaPaths !== undefined && !Array.isArray(mediaPaths)) {
        throw new Error("media_paths must be an array of file path strings.");
    }
    if (!mediaPaths || mediaPaths.length === 0) {
        return { resolvedPaths: [], hasVideo: false, hasImage: false, hasGif: false };
    }
    const resolvedPaths = [];
    let hasVideo = false;
    let hasImage = false;
    let hasGif = false;
    for (const rawPath of mediaPaths) {
        if (!rawPath || typeof rawPath !== "string") {
            throw new Error(`Invalid media path entry: ${rawPath}`);
        }
        const expanded = expandHome(rawPath);
        const resolved = path.resolve(expanded);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Media file does not exist: ${resolved}`);
        }
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) {
            throw new Error(`Media path is not a regular file: ${resolved}`);
        }
        if (stat.size === 0) {
            throw new Error(`Media file is empty (0 bytes): ${resolved}`);
        }
        const ext = path.extname(resolved).toLowerCase();
        const isImg = SUPPORTED_IMAGE_EXTS.has(ext);
        const isVid = SUPPORTED_VIDEO_EXTS.has(ext);
        const isSingleGif = ext === ".gif";
        if (!isImg && !isVid) {
            throw new Error(`Unsupported media format '${ext}' for file ${resolved}. Supported: PNG, JPG, JPEG, MP4, MOV, GIF, WEBP.`);
        }
        if (isVid) {
            if (stat.size > 512 * 1024 * 1024) {
                throw new Error(`Video file exceeds Twitter's 512MB limit: ${resolved}`);
            }
            hasVideo = true;
        }
        else if (isSingleGif) {
            if (stat.size > 15 * 1024 * 1024) {
                throw new Error(`GIF file exceeds Twitter's 15MB limit: ${resolved}`);
            }
            hasGif = true;
        }
        else {
            if (stat.size > 15 * 1024 * 1024) {
                throw new Error(`Image file exceeds Twitter's 15MB limit: ${resolved}`);
            }
            hasImage = true;
        }
        resolvedPaths.push(resolved);
    }
    if (hasGif && resolvedPaths.length > 1) {
        throw new Error("Twitter only supports 1 GIF attachment per post, and GIFs cannot be combined with photos or videos.");
    }
    if (hasVideo && (hasImage || hasGif)) {
        throw new Error("Twitter does not allow attaching videos and images/GIFs in the same post.");
    }
    if (hasGif && hasImage) {
        throw new Error("Twitter does not allow combining GIFs with static photos.");
    }
    if (hasVideo && resolvedPaths.length > 1) {
        throw new Error(`Twitter only supports 1 video attachment per post (received ${resolvedPaths.length}).`);
    }
    if (hasImage && resolvedPaths.length > 4) {
        throw new Error(`Twitter supports a maximum of 4 image attachments per post (received ${resolvedPaths.length}).`);
    }
    return { resolvedPaths, hasVideo, hasImage, hasGif };
}
export async function attachMediaAndWait(page, mediaPaths, timeoutMs = 90000) {
    const { resolvedPaths, hasVideo } = validateMediaPaths(mediaPaths);
    if (resolvedPaths.length === 0)
        return;
    console.error(`[media] Attaching ${resolvedPaths.length} media file(s) (hasVideo: ${hasVideo})...`);
    // Track upload network states
    let isVideoProcessingFailed = false;
    let videoProcessingFailureReason = "";
    let isVideoProcessingComplete = false;
    let hasAsyncProcessing = false;
    let isUploadFinalized = false;
    const responseHandler = async (res) => {
        const url = res.url();
        if (url.includes("upload") && (url.includes("media/upload.json") || url.includes("media/upload2.json"))) {
            try {
                const text = await res.text();
                const data = JSON.parse(text);
                if (data.media_id || data.media_id_string) {
                    if (data.processing_info) {
                        const state = data.processing_info.state;
                        console.error(`[media] Backend video processing state: ${state}`);
                        if (state === "pending" || state === "in_progress") {
                            hasAsyncProcessing = true;
                        }
                        else if (state === "succeeded") {
                            isUploadFinalized = true;
                            isVideoProcessingComplete = true;
                        }
                        else if (state === "failed") {
                            isVideoProcessingFailed = true;
                            videoProcessingFailureReason =
                                data.processing_info.error?.message || "Unknown processing error";
                        }
                    }
                    else {
                        // Immediate finalize without async transcoding
                        isUploadFinalized = true;
                        isVideoProcessingComplete = true;
                    }
                }
            }
            catch (_) { }
        }
    };
    page.on("response", responseHandler);
    try {
        // 1. Locate file input
        const fileInput = page.locator("input[data-testid='fileInput'], input[type='file']").first();
        await fileInput.waitFor({ state: "attached", timeout: 15000 });
        // 2. Set files
        await fileInput.setInputFiles(resolvedPaths);
        console.error(`[media] Set input files on fileInput.`);
        // 3. Wait for upload and processing completion
        const startTime = Date.now();
        while (Date.now() - startTime < timeoutMs) {
            if (isVideoProcessingFailed) {
                throw new Error(`Video processing failed on Twitter backend: ${videoProcessingFailureReason}`);
            }
            // Check for inline upload failure alerts
            const errorAlert = await page
                .locator("[role='alert'], [role='alertdialog'], [data-testid='toast']")
                .first()
                .innerText()
                .catch(() => "");
            if (/failed to upload|could not be uploaded|file is not supported|error uploading/i.test(errorAlert)) {
                throw new Error(`Media upload failed: ${errorAlert}`);
            }
            // Check attachments container and items count
            const attachmentsEl = await page.$("[data-testid='attachments']");
            const removeButtons = await page.$$("[aria-label*='Remove'], [data-testid='removeMedia'], [aria-label*='Dismiss']");
            const photos = await page.$$("[data-testid='tweetPhoto']");
            const videoEl = await page.$("video");
            const attachmentProgressBar = attachmentsEl
                ? await attachmentsEl.$("[role='progressbar'], [data-testid*='progress'], [data-testid*='spinner'], [aria-valuenow]")
                : null;
            // Check post button state (scoped to modal dialog if open)
            const dialog = page.locator("[role='dialog']").first();
            const isDialogVisible = await dialog.isVisible().catch(() => false);
            const postBtn = isDialogVisible
                ? dialog.locator("[data-testid='tweetButton']").first()
                : page.locator("[data-testid='tweetButton'], [data-testid='tweetButtonInline']").first();
            const isVisible = await postBtn.isVisible().catch(() => false);
            const ariaDisabled = isVisible ? await postBtn.getAttribute("aria-disabled") : "true";
            const isButtonReady = isVisible && ariaDisabled !== "true";
            if (hasVideo) {
                const hasVideoPreview = !!videoEl || !!attachmentsEl || removeButtons.length > 0;
                // If async transcoding is underway, wait until succeeded
                if (hasAsyncProcessing && !isVideoProcessingComplete) {
                    console.error("[media] Waiting for async video transcoding completion...");
                    await page.waitForTimeout(1000);
                    continue;
                }
                // Require DOM preview, no progress indicator, upload finalized/transcoded, and Post button ready
                if (hasVideoPreview &&
                    !attachmentProgressBar &&
                    (isUploadFinalized || isVideoProcessingComplete) &&
                    isButtonReady) {
                    console.error(`[media] Video upload and backend processing complete!`);
                    return;
                }
            }
            else {
                // For images/GIF: verify all items have rendered their remove buttons / preview items
                const currentCount = Math.max(removeButtons.length, photos.length);
                const allItemsAttached = currentCount >= resolvedPaths.length;
                if (allItemsAttached && !attachmentProgressBar && isButtonReady) {
                    console.error(`[media] All ${resolvedPaths.length} media attachment(s) uploaded and ready.`);
                    return;
                }
            }
            await page.waitForTimeout(1000);
        }
        throw new Error(`Timed out after ${timeoutMs / 1000}s waiting for media upload/processing to complete.`);
    }
    finally {
        page.off("response", responseHandler);
    }
}
//# sourceMappingURL=media.js.map