
import { sheets, drive } from './google_client';
import { createContainer, publishContainer } from './threads_client';

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const THREADS_USER_ID = process.env.THREADS_USER_ID;
const THREADS_ACCESS_TOKEN = process.env.THREADS_ACCESS_TOKEN;

const DAILY_LIMIT = 3;

/**
 * Returns the number of posts published today by checking the sheet.
 */
export async function getDailyPublishCount(): Promise<number> {
    if (!SPREADSHEET_ID) return 0;

    try {
        const range = 'Sheet1!A:J';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) return 0;

        let postsToday = 0;
        const todayStr = new Date().toISOString().split('T')[0];

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const status = row[7];
            const publishedAt = row[9];

            if (status === 'PUBLISHED' && publishedAt) {
                if (publishedAt.startsWith(todayStr)) {
                    postsToday++;
                }
            }
        }

        return postsToday;
    } catch (error) {
        console.error('Error getting daily publish count:', error);
        return 0;
    }
}

export async function checkAndPublishApprovedPosts() {
    if (!SPREADSHEET_ID || !THREADS_USER_ID || !THREADS_ACCESS_TOKEN) {
        console.error('Missing required environment variables (GOOGLE_SPREADSHEET_ID, THREADS_USER_ID, THREADS_ACCESS_TOKEN).');
        return;
    }

    console.log('Checking for APPROVED posts...');

    try {
        const postsToday = await getDailyPublishCount();

        console.log(`Posts published today so far: ${postsToday}`);

        if (postsToday >= DAILY_LIMIT) {
            console.log(`Daily limit (${DAILY_LIMIT}) reached. Skipping further posts until tomorrow.`);
            return;
        }

        // Read sheet data for publishing
        const range = 'Sheet1!A:I';
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range,
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            console.log('No data found in sheet.');
            return;
        }

        const statusColIndex = 7;

        // Skip header row
        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            // Ensure row has enough columns
            const status = row[statusColIndex];

            if (status === 'APPROVED') {
                console.log(`Processing row ${i + 1} (APPROVED)...`);
                await processRow(i + 1, row);

                // Throttled Loop: Wait 30 seconds between posts to avoid rate limits
                console.log("Waiting 30 seconds before next post...");
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }

    } catch (error) {
        console.error('Error running checkAndPublishApprovedPosts:', error);
    }
}

import { translateContent } from './processor';

// ... (existing imports)

async function processRow(rowIndex: number, row: any[]) {
    try {
        const account = row[1]; // Account username
        let text = row[4]; // Translated Content
        const originalContent = row[3]; // Original Content

        // 0. Check for missing translation (backlog item)
        if (!text && originalContent) {
            console.log(`  Row ${rowIndex}: Missing translation. Generating now...`);
            text = await translateContent(originalContent);

            // Update Sheet with translation (Col E / Index 4)
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Sheet1!E${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: {
                    values: [[text]]
                }
            });
            console.log(`  Row ${rowIndex}: Translation saved to sheet.`);
        }

        // Append Credit
        if (text && account) {
            text += `\n\nCredit: @${account}`;
        }

        const driveLink = row[5]; // Media Drive Link

        // 2. Process Drive Link (continued...)
        let mediaUrl = '';
        let mediaType: 'IMAGE' | 'VIDEO' = 'IMAGE';

        if (driveLink) {
            const fileId = extractFileId(driveLink);
            if (fileId) {
                console.log(`  Found Drive File ID: ${fileId}`);

                // Make public so Threads can access it
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
                // Using lh3.googleusercontent.com/d/ID as it is more reliable for direct image access
                mediaUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
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
        console.log(`  Media URL: ${mediaUrl}`);
        const containerId = await createContainer(
            THREADS_USER_ID!,
            THREADS_ACCESS_TOKEN!,
            mediaType,
            mediaUrl,
            text
        );

        console.log(`  Container ID: ${containerId}`);
        console.log('  Waiting 10 seconds for container to be ready...');
        await new Promise(resolve => setTimeout(resolve, 10000));

        // 4. Publish
        console.log(`  Publishing container ${containerId}...`);
        const publishedId = await publishContainer(
            THREADS_USER_ID!,
            THREADS_ACCESS_TOKEN!,
            containerId
        );

        console.log(`  Published! ID: ${publishedId}`);
        // Construct a plausible URL. 
        // Note: The real URL might need fetching the post object from Threads API if ID isn't enough, 
        // but typically threads.net/@user/post/ID works or redirects.
        const threadsUrl = `https://www.threads.net/post/${publishedId}`;

        // 5. Update Sheet
        // Status -> PUBLISHED (Col H / Index 7)
        // Threads URL -> Col I / Index 8
        // Timestamp -> Col J / Index 9

        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Sheet1!H${rowIndex}:J${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['PUBLISHED', threadsUrl, new Date().toISOString()]] // threadsUrl goes to column I, Timestamp to J
            }
        });

    } catch (err) {
        console.error(`  Failed to process row ${rowIndex}:`, err);
        // Optional: Update status to ERROR?
        // Let's mark it as ERROR so we don't keep retrying infinitely if it's a permanent failure
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
