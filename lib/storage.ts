import { drive, storage } from './google_client';
import axios from 'axios';

/**
 * Uploads a file from Google Drive to Google Cloud Storage and makes it public.
 * @param driveFileId The ID of the file in Google Drive.
 * @param filename The desired filename in GCS.
 * @returns The public URL of the uploaded file.
 */
export async function uploadToGCS(driveFileId: string, filename: string): Promise<string> {
    const bucketName = process.env.GCS_BUCKET_NAME;

    if (!bucketName) {
        throw new Error("GCS_BUCKET_NAME is not defined in environment variables.");
    }

    console.log(`Starting transfer for file: ${filename} from Drive ID: ${driveFileId} to Bucket: ${bucketName}`);

    try {
        // 1. Get file metadata first to check if it's downloadable
        const fileMetadata = await drive.files.get({
            fileId: driveFileId,
            fields: 'id, name, mimeType'
        });

        const { name, mimeType } = fileMetadata.data;
        console.log(`Found file: "${name}" (${mimeType})`);

        if (mimeType === 'application/vnd.google-apps.folder') {
            throw new Error(`Cannot upload Drive folder "${name}". Please provide a file ID.`);
        }

        // Check if it's a Google Workspace file (Docs, Sheets, Slides, etc.)
        if (mimeType?.startsWith('application/vnd.google-apps.')) {
            throw new Error(`Google Docs/Sheets/Slides ("${name}") cannot be downloaded directly. Please provide a binary file (video/image).`);
        }

        // 2. Get the file stream from Google Drive
        const driveResponse = await drive.files.get(
            { fileId: driveFileId, alt: 'media' },
            { responseType: 'stream' }
        );

        // 3. Upload to GCS
        await storage.objects.insert({
            bucket: bucketName,
            name: filename,
            media: {
                body: driveResponse.data,
                contentType: mimeType || undefined
            },
            predefinedAcl: 'publicRead',
        });

        const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
        console.log(`Successfully uploaded to GCS: ${publicUrl}`);
        return publicUrl;

    } catch (error: any) {
        if (error.message.includes('fileNotDownloadable')) {
            console.error('Drive Error: This file cannot be downloaded as media. It might be a Google Doc or folder.');
        } else {
            console.error('Error uploading to GCS:', error.message);
        }
        throw error;
    }
}

/**
 * Downloads media from a URL and uploads it directly to GCS.
 * Used during scraping to store media in GCS from the start.
 * @param url The URL of the media to download.
 * @param filename The desired filename in GCS.
 * @returns The public URL of the uploaded file.
 */
export async function uploadMediaToGCS(url: string, filename: string): Promise<string> {
    const bucketName = process.env.GCS_BUCKET_NAME;

    if (!bucketName) {
        throw new Error("GCS_BUCKET_NAME is not defined in environment variables.");
    }

    console.log(`Downloading and uploading to GCS: ${filename}`);

    try {
        // 1. Download the file
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        const mimeType = response.headers['content-type'];

        // 2. Upload to GCS
        await storage.objects.insert({
            bucket: bucketName,
            name: filename,
            media: {
                body: response.data,
                contentType: mimeType || undefined
            },
            predefinedAcl: 'publicRead',
        });

        const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;
        console.log(`Successfully uploaded to GCS: ${publicUrl}`);
        return publicUrl;

    } catch (error: any) {
        console.error('Error uploading media to GCS:', error.message);
        throw error;
    }
}

