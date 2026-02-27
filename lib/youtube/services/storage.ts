import { BlobServiceClient, generateBlobSASQueryParameters, BlobSASPermissions, StorageSharedKeyCredential } from '@azure/storage-blob';
import * as path from 'path';

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = 'media';

if (!AZURE_STORAGE_CONNECTION_STRING) {
    console.warn('[Storage] Missing AZURE_STORAGE_CONNECTION_STRING in environment variables.');
}

export async function uploadToStorage(localFilePath: string, destinationName: string): Promise<string> {
    if (!AZURE_STORAGE_CONNECTION_STRING) throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');

    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    const blockBlobClient = containerClient.getBlockBlobClient(destinationName);

    await blockBlobClient.uploadFile(localFilePath, {
        blobHTTPHeaders: {
            blobCacheControl: 'public, max-age=31536000',
        },
    });

    console.log(`[Storage] Uploaded ${localFilePath} to Azure Blob: ${destinationName}`);
    return destinationName;
}

/**
 * Compatibility alias
 */
export const uploadToGCS = uploadToStorage;

export async function getSignedUrl(fileName: string): Promise<string> {
    if (!AZURE_STORAGE_CONNECTION_STRING) throw new Error('AZURE_STORAGE_CONNECTION_STRING not configured');

    const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
    const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
    const blockBlobClient = containerClient.getBlockBlobClient(fileName);

    const matches = AZURE_STORAGE_CONNECTION_STRING.match(/AccountName=([^;]+);AccountKey=([^;]+)/);
    if (!matches) throw new Error('Invalid connection string');

    const accountName = matches[1];
    const accountKey = matches[2];

    const sharedKeyCredential = new StorageSharedKeyCredential(accountName, accountKey);

    const sasToken = generateBlobSASQueryParameters({
        containerName: CONTAINER_NAME,
        blobName: fileName,
        permissions: BlobSASPermissions.parse("r"),
        startsOn: new Date(),
        expiresOn: new Date(new Date().valueOf() + 3600 * 1000), // 1 hour
    }, sharedKeyCredential).toString();

    return `${blockBlobClient.url}?${sasToken}`;
}
