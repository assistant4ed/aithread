import cron from "node-cron";
import { PrismaClient } from "@prisma/client";
import { ThreadsScraper } from "./scraper";
import { processPost } from "./processor";
import { logToSheets } from "./sheets_logger";
import { checkAndPublishApprovedPosts, getDailyPublishCount } from "./publisher_service";
import { getAccounts } from "./sheet_config";

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

            const usernames = await getAccounts();
            console.log(`Found ${usernames.length} accounts to scrape from config sheet.`);

            if (usernames.length === 0) {
                console.log("No accounts configured. Add usernames to the 'Accounts' sheet in your config spreadsheet.");
                return;
            }

            for (const username of usernames) {
                console.log(`Scraping ${username}...`);
                // Add artificial delay to avoid rate limits
                await new Promise(r => setTimeout(r, 5000 + Math.random() * 5000));

                try {
                    // Upsert account in Prisma DB so Post foreign key is satisfied
                    const account = await prisma.account.upsert({
                        where: { username },
                        update: { last_polled: new Date() },
                        create: { username },
                    });

                    const posts = await scraper.scrapeAccount(username);
                    console.log(`Found ${posts.length} posts for ${username}`);

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
                    console.error(`Failed to scrape ${username}`, err);
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

