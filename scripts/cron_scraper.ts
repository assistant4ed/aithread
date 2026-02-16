import { ThreadsScraper } from '../lib/scraper';
import { logToSheets } from '../lib/sheets_logger';
import { ensureConfigSheets, getAccounts } from '../lib/sheet_config';
import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(__dirname, '.scraper_state.json');
const BATCH_SIZE = 5;

// Simple Score Formula
function calculateScore(likes: number, replies: number, reposts: number): number {
    return likes + (replies * 2) + (reposts * 3);
}

// Mock Post object compatible with sheets_logger
function createPostObject(threadPost: any, username: string) {
    const score = calculateScore(threadPost.likes, threadPost.replies, threadPost.reposts);
    return {
        id: threadPost.threadId, // Use threadId as ID
        thread_id: threadPost.threadId,
        content_original: threadPost.content,
        content_translated: "",
        // mediaUrls is array, Prisma expects JSON string
        media_urls: JSON.stringify(threadPost.mediaUrls),
        likes: threadPost.likes,
        replies: threadPost.replies,
        reposts: threadPost.reposts,
        hot_score: score,
        url: threadPost.postUrl,
        account_id: "preview-id", // Dummy
        created_at: new Date(),
        posted_at: null,
        account: {
            username: username
        }
    };
}

async function main() {
    await ensureConfigSheets();
    const accounts = await getAccounts();

    let startIndex = 0;

    // Load state
    if (fs.existsSync(STATE_FILE)) {
        try {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            startIndex = data.nextIndex || 0;
            console.log(`Resuming from index ${startIndex}`);
        } catch (e) {
            console.error("Error reading state file, starting from 0");
        }
    }

    // accounts list
    // If we reach the end, wrap around
    if (startIndex >= accounts.length) {
        startIndex = 0;
    }

    const batch = accounts.slice(startIndex, startIndex + BATCH_SIZE);

    // If batch is smaller than BATCH_SIZE because we hit end, wrap around needed? 
    // For simplicity, just take what's left, and next run starts at 0.

    let nextIndex = startIndex + batch.length;
    if (nextIndex >= accounts.length) {
        nextIndex = 0;
    }

    console.log(`Processing batch of ${batch.length} accounts:`, batch.join(', '));

    const scraper = new ThreadsScraper();
    await scraper.init();

    try {
        for (const username of batch) {
            try {
                const posts = await scraper.scrapeAccount(username);
                console.log(`Scraped ${posts.length} posts for ${username}`);

                for (const post of posts) {
                    // Filter empty posts?
                    if (!post.content && (!post.mediaUrls || post.mediaUrls.length === 0)) continue;

                    const postObj = createPostObject(post, username);
                    // Cast to any to bypass strict Prisma type check if needed, 
                    // but structure matches what logToSheets uses.
                    await logToSheets(postObj as any);
                }

            } catch (err) {
                console.error(`Failed to scrape ${username}:`, err);
            }
        }
    } finally {
        await scraper.close();

        // Save state
        fs.writeFileSync(STATE_FILE, JSON.stringify({ nextIndex }));
        console.log(`Saved next index: ${nextIndex}`);
    }
}

main().catch(console.error);
