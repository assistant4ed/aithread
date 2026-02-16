import "dotenv/config";
import { google } from 'googleapis';
import fs from 'fs';
import path from 'path';

const CREDENTIALS_PATH = path.join(process.cwd(), 'drive_tokens.json');

// Initialize OAuth2 Client
const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);

// Load token if exists
if (fs.existsSync(CREDENTIALS_PATH)) {
    const token = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf-8'));
    oauth2Client.setCredentials(token);
} else {
    console.warn("drive_tokens.json not found! Run scripts/auth_google.ts to generate it.");
}

export const sheets = google.sheets({ version: 'v4', auth: oauth2Client });
export const drive = google.drive({ version: 'v3', auth: oauth2Client });
export const storage = google.storage({ version: 'v1', auth: oauth2Client });
export { oauth2Client };
