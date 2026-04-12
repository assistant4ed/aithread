import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import * as path from "path";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET_NAME = "media";

// Legacy Azure support
const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;

function getSupabaseClient() {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be defined.");
    }
    return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
}

export async function uploadToStorage(localFilePath: string, destinationName: string): Promise<string> {
    // Supabase path
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = getSupabaseClient();
        const fileBuffer = fs.readFileSync(localFilePath);
        const ext = path.extname(localFilePath).toLowerCase();
        const mimeType = ext === ".pdf" ? "application/pdf"
            : ext === ".mp4" ? "video/mp4"
            : ext === ".mp3" ? "audio/mpeg"
            : "application/octet-stream";

        const { error } = await supabase.storage
            .from(BUCKET_NAME)
            .upload(destinationName, fileBuffer, {
                contentType: mimeType,
                upsert: true,
                cacheControl: "public, max-age=31536000",
            });

        if (error) throw new Error(`Supabase upload failed: ${error.message}`);

        console.log(`[Storage] Uploaded ${localFilePath} to Supabase: ${destinationName}`);
        return destinationName;
    }

    // Fallback to Azure
    if (AZURE_STORAGE_CONNECTION_STRING) {
        const { BlobServiceClient } = await import("@azure/storage-blob");
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(BUCKET_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(destinationName);

        await blockBlobClient.uploadFile(localFilePath, {
            blobHTTPHeaders: {
                blobCacheControl: "public, max-age=31536000",
            },
        });

        console.log(`[Storage] Uploaded ${localFilePath} to Azure Blob: ${destinationName}`);
        return destinationName;
    }

    throw new Error("No storage backend configured.");
}

/**
 * Compatibility alias
 */
export const uploadToGCS = uploadToStorage;

export async function getSignedUrl(fileName: string): Promise<string> {
    // Supabase: use createSignedUrl
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
        const supabase = getSupabaseClient();
        const { data, error } = await supabase.storage
            .from(BUCKET_NAME)
            .createSignedUrl(fileName, 3600); // 1 hour

        if (error || !data?.signedUrl) {
            throw new Error(`Failed to create signed URL: ${error?.message || "No URL returned"}`);
        }

        return data.signedUrl;
    }

    // Fallback to Azure SAS
    if (AZURE_STORAGE_CONNECTION_STRING) {
        const { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } = await import("@azure/storage-blob");
        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(BUCKET_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(fileName);

        const matches = AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+);AccountKey=([^;]+)/);
        if (!matches) throw new Error("Invalid connection string");

        const accountName = matches[1];
        const accountKey = matches[2];

        const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

        const sasToken = generateBlobSASQueryParameters({
            containerName: BUCKET_NAME,
            blobName: fileName,
            permissions: BlobSASPermissions.parse("r"),
            startsOn: new Date(),
            expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
        }, sharedKeyCredential).toString();

        return `${blockBlobClient.url}?${sasToken}`;
    }

    throw new Error("No storage backend configured.");
}
