import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { ThreadsScraper } from "./scraper";
import { processPost } from "./processor";
import { logToSheets } from "./sheets_logger";
import { checkAndPublishApprovedPosts, getDailyPublishCount } from "./publisher_service";

const prisma = new PrismaClient();
const scraper = new ThreadsScraper();

export function startPolling() {
    console.log("Starting polling service...");

    // Schedule task to run every 5 minutes (Scraping)
    cron.schedule("*/5 * * * *", async () => {
        console.log("Running scheduled scrape...");

        try {
            // Check daily limit — if reached, skip translation to save API quota
            const postsToday = await getDailyPublishCount();
            const limitReached = postsToday >= 3;
            if (limitReached) {
                console.log(`Daily publish limit reached (${postsToday}/3). Scraping will continue but translation will be skipped.`);
            }

            const accounts = await prisma.account.findMany();

            for (const account of accounts) {
                console.log(`Scraping ${account.username}...`);
                // Add artificial delay to avoid rate limits
                await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));

                try {
                    const posts = await scraper.scrapeAccount(account.username);
                    console.log(`Found ${posts.length} posts for ${account.username}`);

                    for (const post of posts) {
                        const savedPost = await processPost(post, account.id, { skipTranslation: limitReached });
                        if (!savedPost) {
                            console.log(`- Post ${post.threadId} already exists (Updated stats).`);
                        } else {
                            console.log(`+ New Post ${savedPost.thread_id} processed. Hot Score: ${savedPost.hot_score}`);

                            if (savedPost.hot_score >= 0) {
                                // Fetch full post object including account for logging
                                const fullPost = await prisma.post.findUnique({
                                    where: { id: savedPost.id },
                                    include: { account: true }
                                });
                                if (fullPost) {
                                    await logToSheets(fullPost);
                                }
                            }
                        }
                    }

                } catch (err) {
                    console.error(`Failed to scrape ${account.username}`, err);
                }
            }

        } catch (error) {
            console.error("Error in polling job:", error);
        }
    });

    // Schedule task to run every 10 minutes (Publishing - Pulse)
    cron.schedule("*/10 * * * *", async () => {
        console.log("Running scheduled publisher check...");
        await checkAndPublishApprovedPosts();
    });
}

