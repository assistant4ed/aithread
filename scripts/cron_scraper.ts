import { ThreadsScraper } from '../lib/scraper';
import { logToSheets } from '../lib/sheets_logger';
import { ensureConfigSheets, getAccounts, getSettings } from '../lib/sheet_config';
import { translateContent } from '../lib/processor';
import fs from 'fs';
import path from 'path';

const STATE_FILE = path.join(__dirname, '.scraper_state.json');
const BATCH_SIZE = 5;

function calculateScore(likes: number, replies: number, reposts: number): number {
    return (likes * 1.5) + (replies * 2) + (reposts * 1);
}

async function createPostObject(threadPost: any, username: string, hotScoreThreshold: number) {
    const score = calculateScore(threadPost.likes, threadPost.replies, threadPost.reposts);

    // Translate only if score exceeds threshold (save LLM quota)
    let translated = "";
    if (score > hotScoreThreshold) {
        console.log(`  Post score ${score} > threshold ${hotScoreThreshold}, translating...`);
        try {
            translated = await translateContent(threadPost.content);
        } catch (err) {
            console.error(`  Translation failed:`, err);
        }
    }

    return {
        id: threadPost.threadId,
        thread_id: threadPost.threadId,
        content_original: threadPost.content,
        content_translated: translated,
        media_urls: JSON.stringify(threadPost.mediaUrls),
        likes: threadPost.likes,
        replies: threadPost.replies,
        reposts: threadPost.reposts,
        hot_score: score,
        url: threadPost.postUrl,
        account_id: "preview-id",
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
    const settings = await getSettings();

    console.log(`Hot score threshold: ${settings.hotScoreThreshold} (posts above this will be translated)`);

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

    if (startIndex >= accounts.length) {
        startIndex = 0;
    }

    const batch = accounts.slice(startIndex, startIndex + BATCH_SIZE);

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
                console.log(`Scraping ${username}...`);
                const posts = await scraper.scrapeAccount(username);
                console.log(`Found ${posts.length} posts for ${username}`);

                for (const post of posts) {
                    if (!post.content && (!post.mediaUrls || post.mediaUrls.length === 0)) continue;

                    const postObj = await createPostObject(post, username, settings.hotScoreThreshold);
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
