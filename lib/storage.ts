import axios from "axios";
import { BlobServiceClient } from "@azure/storage-blob";

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "media";

/**
 * Downloads media from a URL and uploads it directly to Azure Blob Storage.
 * @param url The URL of the media to download.
 * @param filename The desired filename in Azure.
 * @returns The public URL of the uploaded file.
 */
export async function uploadMediaToStorage(url: string, filename: string): Promise<string> {
    if (!AZURE_STORAGE_CONNECTION_STRING) {
        throw new Error("AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables.");
    }

    console.log(`[Storage] Downloading and uploading to Azure: ${filename}`);

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(filename);

        // 1. Download the file
        const response = await axios({
            url,
            method: "GET",
            responseType: "arraybuffer",
        });

        const mimeType = response.headers["content-type"] || "application/octet-stream";
        const buffer = Buffer.from(response.data);

        // 2. Upload to Azure
        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: mimeType }
        });

        const publicUrl = blockBlobClient.url;
        console.log(`[Storage] Uploaded: ${publicUrl}`);
        return publicUrl;
    } catch (error: any) {
        console.error("[Storage] Error uploading media to Azure:", error.message);
        throw error;
    }
}

/**
 * Compatibility alias for uploadMediaToStorage
 */
export const uploadMediaToGCS = uploadMediaToStorage;

export async function uploadBufferToStorage(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    if (!AZURE_STORAGE_CONNECTION_STRING) {
        throw new Error("AZURE_STORAGE_CONNECTION_STRING is not defined in environment variables.");
    }

    console.log(`[Storage] Uploading buffer to Azure: ${filename}`);

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(filename);

        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: mimeType }
        });

        const publicUrl = blockBlobClient.url;
        console.log(`[Storage] Uploaded buffer: ${publicUrl}`);
        return publicUrl;
    } catch (error: any) {
        console.error("[Storage] Error uploading buffer to Azure:", error.message);
        throw error;
    }
}

/**
 * Compatibility alias for uploadBufferToStorage
 */
export const uploadBufferToGCS = uploadBufferToStorage;
/**
 * Deletes a blob from Azure Storage.
 * @param filename The name/path of the blob to delete.
 */
export async function deleteBlobFromStorage(filename: string): Promise<void> {
    if (!AZURE_STORAGE_CONNECTION_STRING) return;

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(filename);

        await blockBlobClient.deleteIfExists();
        console.log(`[Storage] Deleted: ${filename}`);
    } catch (error: any) {
        console.error(`[Storage] Error deleting blob ${filename}:`, error.message);
    }
}

const OWN_BLOB_HOST = "threadsmonitorblobs.blob.core.windows.net";

/**
 * Ensures a media URL is permanent (no expiring SAS tokens).
 * - If the URL is from our own blob storage and has query params (SAS), strips them.
 * - If the URL is from an external source with SAS tokens, downloads and re-uploads.
 * - Otherwise, returns the URL unchanged.
 */
export async function ensurePermanentUrl(url: string): Promise<string> {
    if (!url) return url;

    try {
        const parsed = new URL(url);

        // Our own blob: just strip query params (SAS tokens)
        if (parsed.hostname === OWN_BLOB_HOST && parsed.search) {
            const permanent = `${parsed.origin}${parsed.pathname}`;
            console.log(`[Storage] Stripped SAS params from own blob URL: ${permanent}`);
            return permanent;
        }

        // External Azure blob: has SAS-like params (sig=, skoid=, skt=)
        if (parsed.search && (parsed.searchParams.has("sig") || parsed.searchParams.has("skoid"))) {
            console.log(`[Storage] External SAS URL detected, re-uploading to own storage...`);
            const ext = parsed.pathname.split(".").pop() || "png";
            const filename = `reupload/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
            return await uploadMediaToStorage(url, filename);
        }
    } catch {
        // URL parsing failed — return as-is
    }

    return url;
}

/**
 * Checks if a URL is reachable via HTTP HEAD request.
 * Returns true if the server responds with 2xx, false otherwise.
 */
export async function isUrlReachable(url: string): Promise<boolean> {
    if (!url) return false;
    try {
        const resp = await axios.head(url, { timeout: 10_000 });
        return resp.status >= 200 && resp.status < 300;
    } catch {
        return false;
    }
}
