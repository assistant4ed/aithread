
export interface FacebookSuccessResponse {
    id: string;
    post_id?: string;
}

export interface FacebookErrorResponse {
    error: {
        message: string;
        type: string;
        code: number;
        fbtrace_id: string;
    };
}

const GRAPH_API_VERSION = "v19.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/**
 * Optimal Facebook post text length.
 * Studies show posts under 500 characters get more engagement.
 * Facebook's hard limit is 63,206 characters, but we truncate for performance.
 */
const FB_OPTIMAL_TEXT_LENGTH = 500;

/**
 * Maximum video file size in bytes (1 GB for API uploads).
 */
const FB_MAX_VIDEO_SIZE_BYTES = 1_073_741_824; // 1 GB

/**
 * Posts text content to a Facebook Page feed.
 */
export async function postTextToPage(
    pageId: string,
    pageAccessToken: string,
    message: string
): Promise<string> {
    const endpoint = `${GRAPH_API_BASE}/${pageId}/feed`;

    const body = new URLSearchParams();
    body.append("access_token", pageAccessToken);
    body.append("message", truncateToOptimal(message));

    const response = await fetch(endpoint, { method: "POST", body });

    if (!response.ok) {
        const errorData = (await response.json()) as FacebookErrorResponse;
        console.error("Facebook API Post Error:", JSON.stringify(errorData, null, 2));
        throw new Error(`Facebook API Error: ${errorData.error?.message || "Unknown error"}`);
    }

    const data = (await response.json()) as FacebookSuccessResponse;
    return data.id; // returns "{pageId}_{postId}"
}

/**
 * Posts an image with optional caption to a Facebook Page.
 */
export async function postImageToPage(
    pageId: string,
    pageAccessToken: string,
    imageUrl: string,
    caption?: string
): Promise<string> {
    const endpoint = `${GRAPH_API_BASE}/${pageId}/photos`;

    const body = new URLSearchParams();
    body.append("access_token", pageAccessToken);
    body.append("url", imageUrl);
    if (caption) body.append("message", truncateToOptimal(caption));

    const response = await fetch(endpoint, { method: "POST", body });

    if (!response.ok) {
        const errorData = (await response.json()) as FacebookErrorResponse;
        console.error("Facebook API Photo Error:", JSON.stringify(errorData, null, 2));
        throw new Error(`Facebook Photo Error: ${errorData.error?.message || "Unknown error"}`);
    }

    const data = (await response.json()) as FacebookSuccessResponse;
    // Photos API returns { id, post_id } — post_id is the feed post
    return data.post_id || data.id;
}

/**
 * Posts a video with optional description to a Facebook Page.
 * Uses the "url" parameter for remote video upload.
 */
export async function postVideoToPage(
    pageId: string,
    pageAccessToken: string,
    videoUrl: string,
    description?: string
): Promise<string> {
    const endpoint = `${GRAPH_API_BASE}/${pageId}/videos`;

    const body = new URLSearchParams();
    body.append("access_token", pageAccessToken);
    body.append("file_url", videoUrl);
    if (description) body.append("description", truncateToOptimal(description));

    const response = await fetch(endpoint, { method: "POST", body });

    if (!response.ok) {
        const errorData = (await response.json()) as FacebookErrorResponse;
        console.error("Facebook API Video Error:", JSON.stringify(errorData, null, 2));
        throw new Error(`Facebook Video Error: ${errorData.error?.message || "Unknown error"}`);
    }

    const data = (await response.json()) as FacebookSuccessResponse;
    return data.id;
}

/**
 * Posts a video as a Reel to a Facebook Page.
 * Implements the 3-stage Graph API upload process for Reels.
 * 
 * @param pageId The Facebook Page ID.
 * @param pageAccessToken The Page Access Token.
 * @param videoUrl The URL of the hosted video (must be accessible by Facebook).
 * @param description Optional caption/description for the Reel.
 * @returns The published video ID.
 */
export async function postReelToPage(
    pageId: string,
    pageAccessToken: string,
    videoUrl: string,
    description?: string
): Promise<string> {
    console.log(`[Facebook] Initializing Reel upload for Page ${pageId}...`);

    // --- STEP 1: INITIALIZE ---
    const startEndpoint = `${GRAPH_API_BASE}/${pageId}/video_reels`;
    const startBody = new URLSearchParams();
    startBody.append("upload_phase", "start");
    startBody.append("access_token", pageAccessToken);

    const startRes = await fetch(startEndpoint, { method: "POST", body: startBody });
    if (!startRes.ok) {
        const errorData = (await startRes.json()) as FacebookErrorResponse;
        throw new Error(`Facebook Reels Init Error: ${errorData.error?.message || "Unknown error"}`);
    }

    const { video_id } = (await startRes.json()) as { video_id: string };
    console.log(`[Facebook] Reel initialized. Video ID: ${video_id}. Starting upload...`);

    // --- STEP 2: UPLOAD (via rupload with file_url header) ---
    // Note: The research indicates the subdomain is 'rupload.facebook.com'
    const uploadUrl = `https://rupload.facebook.com/video-upload/${GRAPH_API_VERSION}/${video_id}`;

    const uploadRes = await fetch(uploadUrl, {
        method: "POST",
        headers: {
            "Authorization": `OAuth ${pageAccessToken}`,
            "file_url": videoUrl
        }
    });

    if (!uploadRes.ok) {
        const errorText = await uploadRes.text();
        console.error("Facebook Reels Upload Error:", errorText);
        throw new Error(`Facebook Reels Upload Error: ${uploadRes.statusText}`);
    }

    console.log(`[Facebook] Reel upload complete for ID: ${video_id}. Finalizing...`);

    // --- STEP 3: FINISH & PUBLISH ---
    const finishEndpoint = `${GRAPH_API_BASE}/${pageId}/video_reels`;
    const finishBody = new URLSearchParams();
    finishBody.append("upload_phase", "finish");
    finishBody.append("video_id", video_id);
    finishBody.append("video_state", "PUBLISHED");
    finishBody.append("access_token", pageAccessToken);
    if (description) {
        finishBody.append("description", truncateToOptimal(description));
    }

    const finishRes = await fetch(finishEndpoint, { method: "POST", body: finishBody });
    if (!finishRes.ok) {
        const errorData = (await finishRes.json()) as FacebookErrorResponse;
        throw new Error(`Facebook Reels Finalize Error: ${errorData.error?.message || "Unknown error"}`);
    }

    const finishData = await finishRes.json();
    console.log(`[Facebook] Reel published successfully: ${video_id}`);
    
    return video_id;
}

/**
 * Main entry point: Post content to a Facebook Page with optional media.
 * Implements fallback behavior — if video/image fails, retries as text-only.
 *
 * @returns The published post ID and URL.
 */
export async function publishToFacebookPage(
    pageId: string,
    pageAccessToken: string,
    text: string,
    mediaUrl?: string,
    mediaType?: "IMAGE" | "VIDEO" | "TEXT"
): Promise<{ postId: string; url: string }> {
    let postId: string;

    if (mediaType === "VIDEO" && mediaUrl) {
        try {
            // Validate video URL is reachable and within size limits
            const headRes = await fetch(mediaUrl, { method: "HEAD" }).catch(() => null);
            const contentLength = headRes ? parseInt(headRes.headers.get("content-length") || "0", 10) : 0;

            if (contentLength > FB_MAX_VIDEO_SIZE_BYTES) {
                console.warn(`[Facebook] Video too large (${Math.round(contentLength / 1_048_576)}MB). Falling back to text-only.`);
                postId = await postTextToPage(pageId, pageAccessToken, text);
            } else {
                try {
                    console.log(`[Facebook] Attempting to publish video as a Reel...`);
                    postId = await postReelToPage(pageId, pageAccessToken, mediaUrl, text);
                } catch (reelErr: any) {
                    console.warn(`[Facebook] Reel publishing failed: ${reelErr.message}. Falling back to standard video post.`);
                    postId = await postVideoToPage(pageId, pageAccessToken, mediaUrl, text);
                }
            }
        } catch (videoErr: any) {
            console.warn(`[Facebook] Video post failed: ${videoErr.message}. Falling back to text-only.`);
            postId = await postTextToPage(pageId, pageAccessToken, text);
        }
    } else if (mediaType === "IMAGE" && mediaUrl) {
        try {
            postId = await postImageToPage(pageId, pageAccessToken, mediaUrl, text);
        } catch (imageErr: any) {
            console.warn(`[Facebook] Image post failed: ${imageErr.message}. Falling back to text-only.`);
            postId = await postTextToPage(pageId, pageAccessToken, text);
        }
    } else {
        postId = await postTextToPage(pageId, pageAccessToken, text);
    }

    // Construct permalink
    const url = `https://www.facebook.com/${postId}`;

    return { postId, url };
}

/**
 * Fetches the permalink of a published Facebook post.
 */
export async function getFacebookPost(
    postId: string,
    accessToken: string
): Promise<{ id: string; permalink_url: string }> {
    const endpoint = `${GRAPH_API_BASE}/${postId}?fields=id,permalink_url&access_token=${accessToken}`;

    const response = await fetch(endpoint);
    if (!response.ok) {
        throw new Error(`Failed to fetch Facebook post details: ${response.statusText}`);
    }

    return await response.json();
}

/**
 * Truncate text to optimal Facebook post length for maximum engagement.
 */
function truncateToOptimal(text: string): string {
    if (!text || text.length <= FB_OPTIMAL_TEXT_LENGTH) return text;
    console.log(`[Facebook] Truncating caption (original: ${text.length} chars)`);
    return text.substring(0, FB_OPTIMAL_TEXT_LENGTH - 3) + "...";
}
