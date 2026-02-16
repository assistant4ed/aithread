import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { ThreadsScraper } from "./scraper";
import { processPost } from "./processor";
import { logToSheets } from "./sheets_logger";

const prisma = new PrismaClient();
const scraper = new ThreadsScraper();

export function startPolling() {
    console.log("Starting polling service...");

    // Schedule task to run every 5 minutes
    cron.schedule("*/5 * * * *", async () => {
        console.log("Running scheduled scrape...");

        try {
            const accounts = await prisma.account.findMany();

            for (const account of accounts) {
                console.log(`Scraping ${account.username}...`);
                // Add artificial delay to avoid rate limits
                await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));

                try {
                    const posts = await scraper.scrapeAccount(account.username);
                    console.log(`Found ${posts.length} posts for ${account.username}`);

                    for (const post of posts) {
                        const savedPost = await processPost(post, account.id);
                        console.log(`Processed post ${savedPost?.thread_id} with hot_score: ${savedPost?.hot_score}`);
                        if (savedPost && savedPost.hot_score >= 0) { // Lowered for trial to ensure logging works
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

                } catch (err) {
                    console.error(`Failed to scrape ${account.username}`, err);
                }
            }

        } catch (error) {
            console.error("Error in polling job:", error);
        }
    });
}
