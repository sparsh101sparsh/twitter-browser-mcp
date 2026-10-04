import fs from "node:fs";
import path from "node:path";
const SUPPORTED_IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);
const SUPPORTED_VIDEO_EXTS = new Set([".mp4", ".mov"]);
export function validateMediaPaths(mediaPaths) {
    if (!mediaPaths || mediaPaths.length === 0) {
        return { resolvedPaths: [], hasVideo: false, hasImage: false };
    }
    const resolvedPaths = [];
    let hasVideo = false;
    let hasImage = false;
    for (const rawPath of mediaPaths) {
        if (!rawPath || typeof rawPath !== "string") {
            throw new Error(`Invalid media path entry: ${rawPath}`);
        }
        const resolved = path.resolve(rawPath);
        if (!fs.existsSync(resolved)) {
            throw new Error(`Media file does not exist: ${resolved}`);
        }
        const stat = fs.statSync(resolved);
        if (!stat.isFile()) {
            throw new Error(`Media path is not a regular file: ${resolved}`);
        }
        const ext = path.extname(resolved).toLowerCase();
        const isImg = SUPPORTED_IMAGE_EXTS.has(ext);
        const isVid = SUPPORTED_VIDEO_EXTS.has(ext);
        if (!isImg && !isVid) {
            throw new Error(`Unsupported media format '${ext}' for file ${resolved}. Supported: PNG, JPG, JPEG, MP4, MOV, GIF, WEBP.`);
        }
        if (isVid)
            hasVideo = true;
        if (isImg)
            hasImage = true;
        resolvedPaths.push(resolved);
    }
    if (hasVideo && hasImage) {
        throw new Error("Twitter does not allow attaching videos and images in the same post.");
    }
    if (hasVideo && resolvedPaths.length > 1) {
        throw new Error(`Twitter only supports 1 video attachment per post (received ${resolvedPaths.length}).`);
    }
    if (hasImage && resolvedPaths.length > 4) {
        throw new Error(`Twitter supports a maximum of 4 image attachments per post (received ${resolvedPaths.length}).`);
    }
    return { resolvedPaths, hasVideo, hasImage };
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
    const responseHandler = async (res) => {
        const url = res.url();
        if (url.includes("upload") && (url.includes("media/upload.json") || url.includes("media/upload2.json"))) {
            try {
                const text = await res.text();
                const data = JSON.parse(text);
                if (data.processing_info) {
                    const state = data.processing_info.state;
                    console.error(`[media] Backend video processing state: ${state}`);
                    if (state === "succeeded") {
                        isVideoProcessingComplete = true;
                    }
                    else if (state === "failed") {
                        isVideoProcessingFailed = true;
                        videoProcessingFailureReason =
                            data.processing_info.error?.message || "Unknown processing error";
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
        let attachedPreviewFound = false;
        while (Date.now() - startTime < timeoutMs) {
            if (isVideoProcessingFailed) {
                throw new Error(`Video processing failed on Twitter backend: ${videoProcessingFailureReason}`);
            }
            // Check if preview/attachment element appears
            if (!attachedPreviewFound) {
                const hasAttachment = await page.$("[data-testid='attachments'], [aria-label='Remove media'], [data-testid='tweetPhoto'], video");
                if (hasAttachment) {
                    attachedPreviewFound = true;
                    console.error(`[media] Attachment preview detected in DOM.`);
                }
            }
            // Check post button state
            const postBtn = page.locator("[data-testid='tweetButton'], [data-testid='tweetButtonInline']").first();
            const isVisible = await postBtn.isVisible().catch(() => false);
            const ariaDisabled = isVisible ? await postBtn.getAttribute("aria-disabled") : "true";
            const isButtonReady = isVisible && ariaDisabled !== "true";
            if (hasVideo) {
                // For video: check that attachment preview is found, post button is ready,
                // and any attachment-specific progress bar is gone.
                const attachmentsEl = await page.$("[data-testid='attachments']");
                const attachmentProgressBar = attachmentsEl ? await attachmentsEl.$("[role='progressbar']") : null;
                if (attachedPreviewFound && !attachmentProgressBar && (isButtonReady || isVideoProcessingComplete)) {
                    console.error(`[media] Video upload and backend processing complete!`);
                    return;
                }
            }
            else {
                // For images: preview found and button ready
                if (attachedPreviewFound && isButtonReady) {
                    console.error(`[media] Image attachments uploaded and ready.`);
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