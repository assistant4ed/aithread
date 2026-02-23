import { Storage } from '@google-cloud/storage';
import * as path from 'path';

const BUCKET_NAME = process.env.GCS_BUCKET_NAME;
const PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
const KEY_FILE = process.env.GOOGLE_APPLICATION_CREDENTIALS;

if (!BUCKET_NAME || !PROJECT_ID || !KEY_FILE) {
    console.warn('[Storage] Missing GCS configuration in environment variables.');
}

const storage = new Storage({
    projectId: PROJECT_ID,
    keyFilename: KEY_FILE,
});

export async function uploadToGCS(localFilePath: string, destinationName: string): Promise<string> {
    if (!BUCKET_NAME) throw new Error('GCS_BUCKET_NAME not configured');

    const bucket = storage.bucket(BUCKET_NAME);

    await bucket.upload(localFilePath, {
        destination: destinationName,
        metadata: {
            cacheControl: 'public, max-age=31536000',
        },
    });

    console.log(`[Storage] Uploaded ${localFilePath} to gs://${BUCKET_NAME}/${destinationName}`);
    return destinationName;
}

export async function getSignedUrl(fileName: string): Promise<string> {
    if (!BUCKET_NAME) throw new Error('GCS_BUCKET_NAME not configured');

    const [url] = await storage
        .bucket(BUCKET_NAME)
        .file(fileName)
        .getSignedUrl({
            version: 'v4',
            action: 'read',
            expires: Date.now() + 1 * 60 * 60 * 1000, // 1 hour
        });

    return url;
}
