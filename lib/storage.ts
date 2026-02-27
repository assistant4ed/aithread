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
