import axios from "axios";
import { Storage } from "@google-cloud/storage";

const GCS_BUCKET_NAME = process.env.GCS_BUCKET_NAME;

/**
 * Downloads media from a URL and uploads it directly to GCS.
 * Used during scraping to store media in GCS from the start.
 * @param url The URL of the media to download.
 * @param filename The desired filename in GCS.
 * @returns The public URL of the uploaded file.
 */
export async function uploadMediaToGCS(url: string, filename: string): Promise<string> {
    if (!GCS_BUCKET_NAME) {
        throw new Error("GCS_BUCKET_NAME is not defined in environment variables.");
    }

    console.log(`[Storage] Downloading and uploading to GCS: ${filename}`);

    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
    });

    try {
        // 1. Download the file
        const response = await axios({
            url,
            method: "GET",
            responseType: "arraybuffer",
        });

        const mimeType = response.headers["content-type"] || "application/octet-stream";
        const buffer = Buffer.from(response.data);

        // 2. Upload to GCS using SDK
        const bucket = storage.bucket(GCS_BUCKET_NAME);
        const file = bucket.file(filename);

        await file.save(buffer, {
            contentType: mimeType,
            resumable: false,
            predefinedAcl: "publicRead",
        });

        const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filename}`;
        console.log(`[Storage] Uploaded: ${publicUrl}`);
        return publicUrl;
    } catch (error: any) {
        console.error("[Storage] Error uploading media to GCS:", error.message);
        throw error;
    }
}
export async function uploadBufferToGCS(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    if (!GCS_BUCKET_NAME) {
        throw new Error("GCS_BUCKET_NAME is not defined in environment variables.");
    }

    console.log(`[Storage] Uploading buffer to GCS: ${filename}`);

    const storage = new Storage({
        projectId: process.env.GOOGLE_PROJECT_ID,
    });

    try {
        const bucket = storage.bucket(GCS_BUCKET_NAME);
        const file = bucket.file(filename);

        await file.save(buffer, {
            contentType: mimeType,
            resumable: false,
            predefinedAcl: "publicRead",
        });

        const publicUrl = `https://storage.googleapis.com/${GCS_BUCKET_NAME}/${filename}`;
        console.log(`[Storage] Uploaded buffer: ${publicUrl}`);
        return publicUrl;
    } catch (error: any) {
        console.error("[Storage] Error uploading buffer to GCS:", error.message);
        throw error;
    }
}
