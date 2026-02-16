import "dotenv/config";
import { drive } from "../lib/google_client";

async function checkFile() {
    const fileId = process.argv[2];
    if (!fileId) {
        console.error("Usage: npx tsx scripts/check_file.ts <file_id>");
        process.exit(1);
    }

    try {
        const response = await drive.files.get({
            fileId: fileId,
            fields: 'id, name, mimeType, size'
        });
        console.log("File Metadata:", JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error("Error fetching metadata:", error);
    }
}

checkFile();
