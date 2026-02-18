
import { TwitterApi, EUploadMimeType } from 'twitter-api-v2';
import axios from 'axios';
import fs from 'fs';
import path from 'path';

export interface TwitterConfig {
    appKey?: string;
    appSecret?: string;
    accessToken: string;
    accessSecret?: string;
}

/**
 * Creates a Twitter client instance.
 * Supports both OAuth 1.0a (Legacy) and OAuth 2.0 (Bearer Token).
 */
function getClient(config: TwitterConfig) {
    if (config.accessSecret && config.appKey && config.appSecret) {
        return new TwitterApi({
            appKey: config.appKey,
            appSecret: config.appSecret,
            accessToken: config.accessToken,
            accessSecret: config.accessSecret,
        });
    } else {
        // OAuth 2.0 User Context (Bearer Token)
        return new TwitterApi(config.accessToken);
    }
}

/**
 * Uploads media to Twitter and returns the Media ID.
 * Supports images and videos.
 */
export async function uploadTwitterMedia(
    config: TwitterConfig,
    url: string,
    mediaType: 'image' | 'video'
): Promise<string> {
    const client = getClient(config);

    // Download the file to a temp location because twitter-api-v2 uploadMedia expects a file path or buffer
    // It's safer to stream or buffer.
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const buffer = Buffer.from(response.data);

    // Determine mime type
    let mimeType = EUploadMimeType.Jpeg;
    if (mediaType === 'video') mimeType = EUploadMimeType.Mp4;
    else if (url.endsWith('.png')) mimeType = EUploadMimeType.Png;

    const mediaId = await client.v1.uploadMedia(buffer, { mimeType });
    return mediaId;
}

/**
 * Posts a tweet with optional media.
 */
export async function postTweet(
    config: TwitterConfig,
    text: string,
    mediaIds?: string[]
): Promise<{ id: string; text: string }> {
    const client = getClient(config);

    if (mediaIds && mediaIds.length > 0) {
        // v2 tweet with media
        const response = await client.v2.tweet(text, { media: { media_ids: mediaIds as [string] | [string, string] | [string, string, string] | [string, string, string, string] } });
        return { id: response.data.id, text: response.data.text };
    } else {
        // text only
        const response = await client.v2.tweet(text);
        return { id: response.data.id, text: response.data.text };
    }
}
