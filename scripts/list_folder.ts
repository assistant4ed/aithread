import "dotenv/config";
import { drive } from "../lib/google_client";

async function listFolder() {
    const folderId = process.argv[2];
    if (!folderId) {
        console.error("Usage: npx tsx scripts/list_folder.ts <folder_id>");
        process.exit(1);
    }

    try {
        const response = await drive.files.list({
            q: `'${folderId}' in parents and trashed = false`,
            fields: 'files(id, name, mimeType, size)'
        });
        console.log("Files in folder:", JSON.stringify(response.data.files, null, 2));
    } catch (error) {
        console.error("Error listing folder:", error);
    }
}

listFolder();
