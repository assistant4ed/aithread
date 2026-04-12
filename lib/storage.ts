import axios from "axios";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = "media";

// Legacy Azure support (optional fallback)
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined in environment variables.");
    }
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

/**
 * Downloads media from a URL and uploads it to Supabase Storage.
 * @param url The URL of the media to download.
 * @param filename The desired filename in storage.
 * @returns The public URL of the uploaded file.
 */
export async function uploadMediaToStorage(url: string, filename: string): Promise<string> {
    // If Supabase is configured, use it
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        console.log(`[Storage] Downloading and uploading to Supabase: ${filename}`);
        try {
            const supabase = getSupabaseClient();

            // 1. Download the file
            const response = await axios({
                url,
                method: "GET",
                responseType: "arraybuffer",
            });

            const mimeType = response.headers["content-type"] || "application/octet-stream";
            const buffer = Buffer.from(response.data);

            // 2. Upload to Supabase Storage
            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(filename, buffer, {
                    contentType: mimeType,
                    upsert: true,
                });

            if (error) throw new Error(`Supabase upload failed: ${error.message}`);

            // 3. Get public URL
            const { data: publicUrlData } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(filename);

            console.log(`[Storage] Uploaded: ${publicUrlData.publicUrl}`);
            return publicUrlData.publicUrl;
        } catch (error: any) {
            console.error("[Storage] Error uploading media to Supabase:", error.message);
            throw error;
        }
    }

    // Fallback to Azure Blob Storage (legacy)
    if (AZURE_STORAGE_CONNECTION_STRING) {
        const { BlobServiceClient } = await import("@azure/storage-blob");
        console.log(`[Storage] Downloading and uploading to Azure: ${filename}`);
        try {
            const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
            const containerClient = blobServiceClient.getContainerClient(BUCKET_NAME);
            const blockBlobClient = containerClient.getBlockBlobClient(filename);

            const response = await axios({ url, method: "GET", responseType: "arraybuffer" });
            const mimeType = response.headers["content-type"] || "application/octet-stream";
            const buffer = Buffer.from(response.data);

            await blockBlobClient.uploadData(buffer, {
                blobHTTPHeaders: { blobContentType: mimeType }
            });

            console.log(`[Storage] Uploaded: ${blockBlobClient.url}`);
            return blockBlobClient.url;
        } catch (error: any) {
            console.error("[Storage] Error uploading media to Azure:", error.message);
            throw error;
        }
    }

    throw new Error("No storage backend configured. Set SUPABASE_URL+SUPABASE_SERVICE_ROLE_KEY or AZURE_STORAGE_CONNECTION_STRING.");
}

/**
 * Compatibility alias for uploadMediaToStorage
 */
export const uploadMediaToGCS = uploadMediaToStorage;

export async function uploadBufferToStorage(buffer: Buffer, filename: string, mimeType: string): Promise<string> {
    // Supabase path
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        console.log(`[Storage] Uploading buffer to Supabase: ${filename}`);
        try {
            const supabase = getSupabaseClient();

            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .upload(filename, buffer, {
                    contentType: mimeType,
                    upsert: true,
                });

            if (error) throw new Error(`Supabase upload failed: ${error.message}`);

            const { data: publicUrlData } = supabase.storage
                .from(BUCKET_NAME)
                .getPublicUrl(filename);

            console.log(`[Storage] Uploaded buffer: ${publicUrlData.publicUrl}`);
            return publicUrlData.publicUrl;
        } catch (error: any) {
            console.error("[Storage] Error uploading buffer to Supabase:", error.message);
            throw error;
        }
    }

    // Fallback to Azure
    if (AZURE_STORAGE_CONNECTION_STRING) {
        const { BlobServiceClient } = await import("@azure/storage-blob");
        console.log(`[Storage] Uploading buffer to Azure: ${filename}`);
        try {
            const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
            const containerClient = blobServiceClient.getContainerClient(BUCKET_NAME);
            const blockBlobClient = containerClient.getBlockBlobClient(filename);

            await blockBlobClient.uploadData(buffer, {
                blobHTTPHeaders: { blobContentType: mimeType }
            });

            console.log(`[Storage] Uploaded buffer: ${blockBlobClient.url}`);
            return blockBlobClient.url;
        } catch (error: any) {
            console.error("[Storage] Error uploading buffer to Azure:", error.message);
            throw error;
        }
    }

    throw new Error("No storage backend configured.");
}

/**
 * Compatibility alias for uploadBufferToStorage
 */
export const uploadBufferToGCS = uploadBufferToStorage;

/**
 * Deletes a file from storage.
 * @param filename The name/path of the file to delete.
 */
export async function deleteBlobFromStorage(filename: string): Promise<void> {
    // Supabase path
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        try {
            const supabase = getSupabaseClient();
            const { error } = await supabase.storage
                .from(BUCKET_NAME)
                .remove([filename]);

            if (error) {
                console.error(`[Storage] Error deleting from Supabase ${filename}:`, error.message);
            } else {
                console.log(`[Storage] Deleted: ${filename}`);
            }
        } catch (error: any) {
            console.error(`[Storage] Error deleting ${filename}:`, error.message);
        }
        return;
    }

    // Fallback to Azure
    if (AZURE_STORAGE_CONNECTION_STRING) {
        try {
            const { BlobServiceClient } = await import("@azure/storage-blob");
            const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
            const containerClient = blobServiceClient.getContainerClient(BUCKET_NAME);
            const blockBlobClient = containerClient.getBlockBlobClient(filename);
            await blockBlobClient.deleteIfExists();
            console.log(`[Storage] Deleted: ${filename}`);
        } catch (error: any) {
            console.error(`[Storage] Error deleting blob ${filename}:`, error.message);
        }
    }
}

const OWN_SUPABASE_HOST = SUPABASE_URL ? new URL(SUPABASE_URL).hostname : "";
const OWN_BLOB_HOST = "threadsmonitorblobs.blob.core.windows.net";

/**
 * Ensures a media URL is permanent (no expiring SAS tokens).
 * - If the URL is from our own storage, returns it unchanged.
 * - If the URL is from an external source with SAS tokens, downloads and re-uploads.
 * - Otherwise, returns the URL unchanged.
 */
export async function ensurePermanentUrl(url: string): Promise<string> {
    if (!url) return url;

    try {
        const parsed = new URL(url);

        // Our own Supabase storage: already permanent
        if (OWN_SUPABASE_HOST && parsed.hostname === OWN_SUPABASE_HOST) {
            return url;
        }

        // Our own Azure blob: strip query params (SAS tokens)
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
