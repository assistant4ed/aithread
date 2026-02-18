
export interface InstagramSuccessResponse {
    id: string;
}

export interface InstagramErrorResponse {
    error: {
        message: string;
        type: string;
        code: number;
        fbtrace_id: string;
    };
}

/**
 * Creates a media container on Instagram.
 * 
 * @param instagramAccountId The Instagram Business Account ID.
 * @param accessToken The long-lived access token.
 * @param mediaType 'IMAGE', 'VIDEO', or 'CAROUSEL'.
 * @param url The URL of the image or video.
 * @param caption The caption text.
 * @param children For CAROUSEL, list of container IDs.
 * @param isCarouselItem If true, this container is for a carousel.
 * @param coverUrl Optional cover URL for video.
 */
export async function createInstagramContainer(
    instagramAccountId: string,
    accessToken: string,
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL',
    url?: string,
    caption?: string,
    children?: string[],
    isCarouselItem?: boolean,
    coverUrl?: string
): Promise<string> {
    const endpoint = `https://graph.facebook.com/v19.0/${instagramAccountId}/media`;

    const body = new URLSearchParams();
    body.append('access_token', accessToken);

    // Instagram expects specific parameters based on type
    if (mediaType === 'IMAGE') {
        if (!url) throw new Error("Image URL required for IMAGE type");
        body.append('image_url', url);
    } else if (mediaType === 'VIDEO') {
        if (!url) throw new Error("Video URL required for VIDEO type");
        body.append('media_type', 'VIDEO');
        body.append('video_url', url);
        if (coverUrl) body.append('cover_url', coverUrl);
    } else if (mediaType === 'CAROUSEL') {
        body.append('media_type', 'CAROUSEL');
        if (children && children.length > 0) {
            body.append('children', children.join(','));
        }
    }

    if (caption && !isCarouselItem) {
        body.append('caption', caption);
    }

    if (isCarouselItem) {
        body.append('is_carousel_item', 'true');
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        body: body,
    });

    if (!response.ok) {
        const errorData = (await response.json()) as InstagramErrorResponse;
        console.error('Instagram API Create Error:', JSON.stringify(errorData, null, 2));
        throw new Error(`Instagram API Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = (await response.json()) as InstagramSuccessResponse;
    return data.id;
}

/**
 * Publishes a media container on Instagram.
 */
export async function publishInstagramContainer(
    instagramAccountId: string,
    accessToken: string,
    creationId: string
): Promise<string> {
    const endpoint = `https://graph.facebook.com/v19.0/${instagramAccountId}/media_publish`;

    const body = new URLSearchParams();
    body.append('access_token', accessToken);
    body.append('creation_id', creationId);

    const response = await fetch(endpoint, {
        method: 'POST',
        body: body,
    });

    if (!response.ok) {
        const errorData = (await response.json()) as InstagramErrorResponse;
        console.error('Instagram API Publish Error:', JSON.stringify(errorData, null, 2));
        throw new Error(`Instagram Publish Error: ${errorData.error?.message || 'Unknown error'}`);
    }

    const data = (await response.json()) as InstagramSuccessResponse;
    return data.id;
}

/**
 * Polls container status.
 */
export async function waitForInstagramContainer(
    containerId: string,
    accessToken: string,
    maxAttempts = 30,
    intervalMs = 5000
): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));

        // Instagram Status Check
        const endpoint = `https://graph.facebook.com/v19.0/${containerId}?fields=status_code,status&access_token=${accessToken}`;

        try {
            const response = await fetch(endpoint);
            if (!response.ok) continue;

            const data = await response.json();
            const status = data.status_code; // FINISHED, IN_PROGRESS, ERROR

            if (status === 'FINISHED') return 'FINISHED';
            if (status === 'ERROR') throw new Error(`Instagram container failed: ${data.status}`);

        } catch (e) {
            console.warn(`[Instagram] Status check failed: ${e}`);
        }
    }
    throw new Error("Instagram container timeout");
}

/**
 * Get permalink of published media
 */
export async function getInstagramMedia(
    mediaId: string,
    accessToken: string
): Promise<{ id: string; permalink: string; shortcode: string }> {
    const endpoint = `https://graph.facebook.com/v19.0/${mediaId}?fields=id,permalink,shortcode&access_token=${accessToken}`;

    const response = await fetch(endpoint);
    if (!response.ok) throw new Error("Failed to fetch Instagram media details");

    return await response.json();
}
