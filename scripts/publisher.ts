
import { sheets, drive } from '../lib/google_client';
import { createContainer, publishContainer } from '../lib/threads_client';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;

async function main() {
    if (!SPREADSHEET_ID || !THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
        console.error('Missing required environment variables (GOOGLE_SPREADSHEET_ID, THREADS_USER_ID, THREADS_ACCESS_TOKEN).');
        process.exit(1);
    }

    console.log('Checking for APPROVED posts...');

    try {
        // 1. Read Sheet Data
        const range = 'Sheet1!A:I'; // Reading up to I to check if already processed or to ensure we have context
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found.');
            return;
        }

        // Headers are in row 0
        // Indices based on ensureHeaders in sheets_logger.ts:
        // 0: Timestamp, 1: Account, 2: Hot Score, 3: Original Content, 4: Translated Content, 
        // 5: Media Drive Link, 6: Original URL, 7: Status, 8: Threads URL (New)

        const statusColIndex = 7;
        const translatedContentIndex = 4;
        const mediaLinkIndex = 5;

        // Loop from bottom up or top down? Top down is fine.
        // Skip header row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const status = row[statusColIndex];

            if (status === 'APPROVED') {
                console.log(`Processing row ${i + 1}...`);
                await processRow(i + 1, row);
            }
        }

    } catch (error) {
        console.error('Error running publisher:', error);
    }
}

async function processRow(rowIndex: number, row: any[]) {
    try {
        const text = row[4]; // Translated Content
        const driveLink = row[5]; // Media Drive Link

        // 2. Process Drive Link
        let mediaUrl = '';
        let mediaType: 'IMAGE' | 'VIDEO' = 'IMAGE';

        if (driveLink) {
            const fileId = extractFileId(driveLink);
            if (fileId) {
                console.log(`  Found Drive File ID: ${fileId}`);

                // Make public
                await drive.permissions.create({
                    fileId: fileId,
                    requestBody: {
                        role: 'reader',
                        type: 'anyone',
                    },
                });

                // Get Metadata to determine type
                const fileMeta = await drive.files.get({
                    fileId: fileId,
                    fields: 'mimeType, webViewLink'
                });

                const mimeType = fileMeta.data.mimeType || '';
                if (mimeType.startsWith('video/')) {
                    mediaType = 'VIDEO';
                }

                // Construct direct download link which Threads API can ingest
                mediaUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
            } else {
                console.warn(`  Could not extract ID from link: ${driveLink}`);
            }
        }

        if (!mediaUrl && !text) {
            console.log(`  Row ${rowIndex}: No text or media, skipping.`);
            return;
        }

        // 3. Create Container
        console.log(`  Creating Threads container (${mediaType})...`);
        const containerId = await createContainer(
            THREADS_USER_ID!,
            THREADS_ACCESS_TOKEN!,
            mediaType,
            mediaUrl,
            text
        );

        // 4. Publish
        console.log(`  Publishing container ${containerId}...`);
        const publishedId = await publishContainer(
            THREADS_USER_ID!,
            THREADS_ACCESS_TOKEN!,
            containerId
        );

        console.log(`  Published! ID: ${publishedId}`);
        const threadsUrl = `https://www.threads.net/@me/post/${publishedId}`; // This is a guess on URL format, ID is usually just a number

        // 5. Update Sheet
        // Status -> PUBLISHED (Col H / Index 7)
        // Threads URL -> Col I / Index 8

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Sheet1!H${rowIndex}:I${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['PUBLISHED', publishedId]]
            }
        });

    } catch (err) {
        console.error(`  Failed to process row ${rowIndex}:`, err);
        // Optional: Update status to ERROR?
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Sheet1!H${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['ERROR']]
            }
        });
    }
}

function extractFileId(url: string): string | null {
    // Matches patterns like:
    // https://drive.google.com/file/d/1hUJm7EaMAnKgvBTUbhMZ-Qy5X7dP4nWd/view?usp=drivesdk
    // https://drive.google.com/open?id=1hUJm7EaMAnKgvBTUbhMZ-Qy5X7dP4nWd
    const match = url.match(/[-\w]{25,}/);
    return match ? match[0] : null;
}

main();
