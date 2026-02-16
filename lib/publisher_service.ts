
import { sheets } from './google_client';
import { createContainer, publishContainer, waitForContainer } from './threads_client';
import { translateContent } from './processor';

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

        for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            const status = row[7];

            if (status === 'APPROVED') {
                console.log(`Processing row ${i + 1} (APPROVED)...`);
                await processRow(i + 1, row);

                console.log("Waiting 30 seconds before next post...");
                await new Promise(resolve => setTimeout(resolve, 30000));
            }
        }

    } catch (error) {
        console.error('Error running checkAndPublishApprovedPosts:', error);
    }
}

async function processRow(rowIndex: number, row: any[]) {
    try {
        const account = row[1];
        let text = row[4]; // Translated Content
        const originalContent = row[3];

        // Auto-translate if missing
        if (!text && originalContent) {
            console.log(`  Row ${rowIndex}: Missing translation. Generating now...`);
            text = await translateContent(originalContent);

            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: `Sheet1!E${rowIndex}`,
                valueInputOption: 'USER_ENTERED',
                requestBody: { values: [[text]] }
            });
            console.log(`  Row ${rowIndex}: Translation saved.`);
        }

        if (text && account) {
            text += `\n\nCredit: @${account}`;
        }

        // Media GCS URL is already in the sheet (column F)
        const gcsUrl = row[5] || '';
        let mediaType: 'IMAGE' | 'VIDEO' = 'IMAGE';

        if (gcsUrl) {
            // Determine media type from URL or assume VIDEO for .mp4
            if (gcsUrl.toLowerCase().includes('.mp4') || gcsUrl.toLowerCase().includes('video')) {
                mediaType = 'VIDEO';
            }
            console.log(`  Using GCS URL: ${gcsUrl} (${mediaType})`);
        }

        if (!gcsUrl && !text) {
            console.log(`  Row ${rowIndex}: No text or media, skipping.`);
            return;
        }

        // Create Threads container
        console.log(`  Creating Threads container (${mediaType})...`);
        const containerId = await createContainer(
            THREADS_USER_ID!,
            THREADS_ACCESS_TOKEN!,
            mediaType,
            gcsUrl,
            text
        );

        console.log(`  Container ID: ${containerId}`);

        if (mediaType === 'VIDEO') {
            console.log('  Waiting for video container to finish processing...');
            await waitForContainer(containerId, THREADS_ACCESS_TOKEN!);
        } else {
            console.log('  Waiting 10 seconds for container to be ready...');
            await new Promise(resolve => setTimeout(resolve, 10000));
        }

        // Publish
        console.log(`  Publishing container ${containerId}...`);
        const publishedId = await publishContainer(
            THREADS_USER_ID!,
            THREADS_ACCESS_TOKEN!,
            containerId
        );

        console.log(`  Published! ID: ${publishedId}`);
        const threadsUrl = `https://www.threads.net/post/${publishedId}`;

        // Update Sheet: PUBLISHED + URL + timestamp
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Sheet1!H${rowIndex}:J${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: {
                values: [['PUBLISHED', threadsUrl, new Date().toISOString()]]
            }
        });

    } catch (err) {
        console.error(`  Failed to process row ${rowIndex}:`, err);
        await sheets.spreadsheets.values.update({
            spreadsheetId: SPREADSHEET_ID,
            range: `Sheet1!H${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            requestBody: { values: [['ERROR']] }
        });
    }
}