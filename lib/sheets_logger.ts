import { sheets, drive } from "./google_client";
import { Post } from "@prisma/client";
import fs from "fs";
import path from "path";
import axios from "axios";

const SPREADSHEET_ID = process.env.GOOGLE_SPREADSHEET_ID;
const DRIVE_FOLDER_ID = process.env.GOOGLE_DRIVE_FOLDER_ID;

export async function logToSheets(post: Post & { account: { username: string } }) {
    if (!SPREADSHEET_ID) {
        console.error("GOOGLE_SPREADSHEET_ID is not set");
        return;
    }

    try {
        await ensureHeaders();
        // Upload media to Drive if present
        let driveLink = "";
        if (post.media_urls) {
            const mediaUrls = JSON.parse(post.media_urls);
            if (mediaUrls.length > 0) {
                // Determine media type (image or video)
                // For MVP, simplistic check or default to first image
                driveLink = await uploadMediaToDrive(mediaUrls[0], post.id);
            }
        }

        // Append to Sheet
        await sheets.spreadsheets.values.append({
            spreadsheetId: SPREADSHEET_ID,
            range: "Sheet1!A:H", // Adjust based on actual sheet name
            valueInputOption: "USER_ENTERED",
            requestBody: {
                values: [[
                    new Date().toISOString(),
                    post.account.username,
                    post.hot_score.toString(),
                    post.content_original,
                    post.content_translated || "",
                    driveLink,
                    post.url || "",
                    "PENDING_REVIEW"
                ]]
            }
        });

        console.log(`Logged post ${post.id} to Sheets.`);
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
                        "Media Drive Link",
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

async function uploadMediaToDrive(url: string, postId: string): Promise<string> {
    if (!DRIVE_FOLDER_ID) {
        console.warn("GOOGLE_DRIVE_FOLDER_ID not set, skipping upload.");
        return "";
    }

    try {
        // 1. Download the file to a temp location
        const response = await axios({
            url,
            method: 'GET',
            responseType: 'stream'
        });

        // 2. Upload to Drive
        const fileMetadata = {
            name: `post_${postId}_${Date.now()}`,
            parents: [DRIVE_FOLDER_ID]
        };

        const media = {
            mimeType: response.headers['content-type'],
            body: response.data
        };

        const file = await drive.files.create({
            requestBody: fileMetadata,
            media: media,
            fields: 'id, webViewLink'
        });

        return file.data.webViewLink || "";

    } catch (error) {
        console.error("Error uploading to Drive:", error);
        return "";
    }
}
