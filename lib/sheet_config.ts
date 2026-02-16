import { sheets } from "./google_client";

const CONFIG_SPREADSHEET_ID = process.env.CONFIG_SHEET_ID;

// Default Settings
const DEFAULT_TRANSLATION_PROMPT = `You are a professional translator. Translate the following Threads post to Traditional Chinese (Hong Kong style, Cantonese nuances if applicable).

RULES:
1. Output ONLY the translated text. Do NOT add "Here is the translation" or any conversational filler.
2. Do NOT translate the username, date code (e.g., 2d, 10/07/24), or engagement numbers (e.g., 604, 197) if they appear at the start or end. Try to identify the main body of the post and translate that.
3. Maintain the tone and brevity.`;

const DEFAULT_HOT_SCORE_THRESHOLD = "50";

interface AppSettings {
    translationPrompt: string;
    hotScoreThreshold: number;
}

// Simple in-memory cache
let cachedAccounts: string[] | null = null;
let cachedSettings: AppSettings | null = null;

export async function ensureConfigSheets() {
    if (!CONFIG_SPREADSHEET_ID) {
        console.error("CONFIG_SHEET_ID is not set.");
        return;
    }

    try {
        const response = await sheets.spreadsheets.get({
            spreadsheetId: CONFIG_SPREADSHEET_ID,
        });

        const sheetsList = response.data.sheets || [];
        const sheetTitles = sheetsList.map(s => s.properties?.title);

        // 1. Ensure "Accounts" sheet
        if (!sheetTitles.includes("Accounts")) {
            console.log("Creating 'Accounts' sheet...");
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: CONFIG_SPREADSHEET_ID,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: "Accounts" } } }]
                }
            });

            // Add header
            const accountRows = [["Username"]];
            await sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG_SPREADSHEET_ID,
                range: "Accounts!A1",
                valueInputOption: "USER_ENTERED",
                requestBody: { values: accountRows }
            });
        }

        // 2. Ensure "Settings" sheet
        if (!sheetTitles.includes("Settings")) {
            console.log("Creating 'Settings' sheet...");
            await sheets.spreadsheets.batchUpdate({
                spreadsheetId: CONFIG_SPREADSHEET_ID,
                requestBody: {
                    requests: [{ addSheet: { properties: { title: "Settings" } } }]
                }
            });

            // Seed with default settings
            const settingsRows = [
                ["Key", "Value"],
                ["TRANSLATION_PROMPT", DEFAULT_TRANSLATION_PROMPT],
                ["HOT_SCORE_THRESHOLD", DEFAULT_HOT_SCORE_THRESHOLD]
            ];
            await sheets.spreadsheets.values.update({
                spreadsheetId: CONFIG_SPREADSHEET_ID,
                range: "Settings!A1",
                valueInputOption: "USER_ENTERED",
                requestBody: { values: settingsRows }
            });
        }

    } catch (error) {
        console.error("Error ensuring config sheets:", error);
    }
}

export async function getAccounts(): Promise<string[]> {
    if (cachedAccounts) return cachedAccounts;
    if (!CONFIG_SPREADSHEET_ID) return [];

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG_SPREADSHEET_ID,
            range: "Accounts!A2:A", // Skip header
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return [];
        }

        const accounts = rows.map(r => r[0]).filter(Boolean);
        cachedAccounts = accounts;
        return accounts;
    } catch (error) {
        console.error("Error fetching accounts from sheet:", error);
        return []; // Fallback empty
    }
}

export async function getSettings(): Promise<AppSettings> {
    if (cachedSettings) return cachedSettings;

    const defaults = {
        translationPrompt: DEFAULT_TRANSLATION_PROMPT,
        hotScoreThreshold: parseFloat(DEFAULT_HOT_SCORE_THRESHOLD)
    };

    if (!CONFIG_SPREADSHEET_ID) return defaults;

    try {
        const response = await sheets.spreadsheets.values.get({
            spreadsheetId: CONFIG_SPREADSHEET_ID,
            range: "Settings!A2:B", // Skip header
        });

        const rows = response.data.values;
        if (!rows || rows.length === 0) {
            return defaults;
        }

        const settingsMap = new Map<string, string>();
        rows.forEach(row => {
            if (row[0] && row[1]) {
                settingsMap.set(row[0], row[1]);
            }
        });

        const prompt = settingsMap.get("TRANSLATION_PROMPT") || DEFAULT_TRANSLATION_PROMPT;
        const thresholdStr = settingsMap.get("HOT_SCORE_THRESHOLD") || DEFAULT_HOT_SCORE_THRESHOLD;
        const threshold = parseFloat(thresholdStr);

        cachedSettings = {
            translationPrompt: prompt,
            hotScoreThreshold: isNaN(threshold) ? 50 : threshold
        };
        return cachedSettings;

    } catch (error) {
        console.error("Error fetching settings from sheet:", error);
        return defaults;
    }
}
