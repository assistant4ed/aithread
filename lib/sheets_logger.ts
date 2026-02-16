import { sheets } from "./google_client";
import { Post } from "@prisma/client";
import { uploadMediaToGCS } from "./storage";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;

export async function logToSheets(post: Post & { account: { username: string } }) {
    if (!SPREADSHEET_ID) {
        console.error("GOOGLE_SPREADSHEET_ID is not set");
        return;
    }

    try {
        await ensureHeaders();

        // Upload media to GCS if present
        let gcsUrl = "";
        if (post.media_urls) {
            const mediaItems = JSON.parse(post.media_urls);
            if (mediaItems.length > 0) {
                const firstItem = mediaItems[0];
                const mediaUrl = typeof firstItem === 'string' ? firstItem : firstItem.url;
                const mediaType = typeof firstItem === 'string' ? 'image' : firstItem.type;

                // Include file extension based on media type so publisher can detect it
                const extension = mediaType === 'video' ? '.mp4' : '.jpg';
                const filename = `scraped/${Date.now()}_post_${post.id}${extension}`;

                gcsUrl = await uploadMediaToGCS(mediaUrl, filename);
            }
        }

        // Append to Sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "Sheet1!A:H",
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [[
                    new Date().toISOString(),
                    post.account.username,
                    post.hot_score.toString(),
                    post.content_original,
                    post.content_translated || "",
                    gcsUrl,
                    post.url || "",
                    "PENDING_REVIEW"
                ]]
            }
        });

        console.log(`Logged post ${post.id} to Sheets with GCS URL.`);
    } catch (error) {
        console.error("Error logging to Google Sheets:", error);
    }
}

async function ensureHeaders() {
    if (!SPREADSHEET_ID) return;

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: SPREADSHEET_ID,
            range: "Sheet1!A1:H1",
        });

        const values = response.data.values;
        if (!values || values.length === 0 || values[0][0] !== "Timestamp") {
            console.log("Sheet empty. Creating headers...");
            await sheets.spreadsheets.values.update({
                spreadsheetId: SPREADSHEET_ID,
                range: "Sheet1!A1:H1",
                valueInputOption: "USER_ENTERED",
                requestBody: {
                    values: [[
                        "Timestamp",
                        "Account",
                        "Hot Score",
                        "Original Content",
                        "Translated Content (HK)",
                        "Media GCS URL",
                        "Original URL",
                        "Status"
                    ]]
                }
            });
        }
    } catch (e) {
        console.error("Error ensuring headers:", e);
    }
}
