
export interface ThreadsSuccessResponse {
    id: string;
}

export interface ThreadsErrorResponse {
    error: {
        message: string;
        type: string;
        code: number;
        fbtrace_id: string;
    };
}

/**
 * Creates a media container on Threads.
 * 
 * @param userId The Threads user ID.
 * @param accessToken The long-lived access token.
 * @param mediaType The type of media: 'IMAGE', 'VIDEO', 'CAROUSEL', or 'TEXT'.
 * @param url The URL of the image or video (required for IMAGE/VIDEO).
 * @param text The text content of the post.
 * @param children For CAROUSEL, a list of child container IDs.
 * @param isCarouselItem If true, this container is an item within a carousel.
 * @returns The container ID.
 */
export async function createContainer(
    userId: string,
    accessToken: string,
    mediaType: 'IMAGE' | 'VIDEO' | 'CAROUSEL' | 'TEXT',
    url?: string,
    text?: string,
    children?: string[],
    isCarouselItem?: boolean
): Promise<string> {
    const endpoint = `https://graph.threads.net/v1.0/${userId}/threads`;

    const body = new URLSearchParams();
    // Safety check: if URL ends in .mp4, treat as VIDEO
    if (url && (url.toLowerCase().endsWith('.mp4') || url.toLowerCase().includes('video'))) {
        mediaType = 'VIDEO';
    }

    body.append('access_token', accessToken);
    body.append('media_type', mediaType);

    if (text) body.append('text', text);

    if (mediaType === 'IMAGE' && url) {
        body.append('image_url', url);
    } else if (mediaType === 'VIDEO' && url) {
        body.append('video_url', url);
    }

    if (mediaType === 'CAROUSEL' && children && children.length > 0) {
        // children must be a comma-separated list of container IDs
        body.append('children', children.join(','));
    }

    if (isCarouselItem) {
        body.append('is_carousel_item', 'true');
    }

    const response = await fetch(endpoint, {
        method: 'POST',
        body: body,
    });

    if (!response.ok) {
        const errorData = (await response.json()) as ThreadsErrorResponse;
        console.error('Threads API Error Details:', JSON.stringify(errorData, null, 2));
        const errorMessage = errorData.error ? errorData.error.message : 'Unknown error';
        throw new Error(`Threads API Create Container Error: ${errorMessage}`);
    }

    const data = (await response.json()) as ThreadsSuccessResponse;
    return data.id;
}

/**
 * Publishes a media container on Threads.
 * 
 * @param userId The Threads user ID.
 * @param accessToken The long-lived access token.
 * @param creationId The ID of the container to publish.
 * @returns The published media ID.
 */
export async function publishContainer(
    userId: string,
    accessToken: string,
    creationId: string
): Promise<string> {
    const endpoint = `https://graph.threads.net/v1.0/${userId}/threads_publish`;

    const body = new URLSearchParams();
    body.append('access_token', accessToken);
    body.append('creation_id', creationId);

    const response = await fetch(endpoint, {
        method: 'POST',
        body: body,
    });

    if (!response.ok) {
        const errorData = (await response.json()) as ThreadsErrorResponse;
        console.error('Threads API Publish Error Details:', JSON.stringify(errorData, null, 2));
        const errorMessage = errorData.error ? errorData.error.message : 'Unknown error';
        throw new Error(`Threads API Publish Error: ${errorMessage}`);
    }

    const data = (await response.json()) as ThreadsSuccessResponse;
    return data.id;
}

/**
 * Polls a media container's status until it is FINISHED (required for VIDEO).
 * 
 * @param containerId The container ID to check.
 * @param accessToken The long-lived access token.
 * @param maxAttempts Maximum number of polling attempts (default 30).
 * @param intervalMs Milliseconds between polls (default 5000).
 * @returns The final status string.
 */
export async function waitForContainer(
    containerId: string,
    accessToken: string,
    maxAttempts: number = 30,
    intervalMs: number = 10000
): Promise<string> {
    for (let i = 0; i < maxAttempts; i++) {
        await new Promise(resolve => setTimeout(resolve, intervalMs));

        const endpoint = `https://graph.threads.net/v1.0/${containerId}?fields=status,error_message&access_token=${accessToken}`;

        try {
            const response = await fetch(endpoint);

            if (!response.ok) {
                const errorBody = await response.text();
                console.warn(`  Status check failed (attempt ${i + 1}/${maxAttempts}), HTTP ${response.status}: ${errorBody}`);
                continue;
            }

            const data = await response.json() as any;
            const status = data.status;
            console.log(`  Container status (attempt ${i + 1}/${maxAttempts}): ${status}${data.error_message ? ' — ' + data.error_message : ''}`);

            if (status === 'FINISHED') {
                return status;
            }

            if (status === 'ERROR') {
                throw new Error(`Container processing failed: ${data.error_message || 'Unknown error'}`);
            }

            // IN_PROGRESS or EXPIRED — continue polling
        } catch (err: any) {
            if (err.message.startsWith('Container processing failed')) throw err;
            console.warn(`  Status check exception (attempt ${i + 1}/${maxAttempts}):`, err.message);
        }
    }

    throw new Error(`Container ${containerId} did not finish after ${maxAttempts} attempts`);
}
