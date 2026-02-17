import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { ThreadsScraper } from "../lib/scraper";
import { processPost, WorkspaceSettings } from "../lib/processor";
import { checkAndPublishApprovedPosts, getDailyPublishCount } from "../lib/publisher_service";
import { uploadMediaToGCS } from "../lib/storage";

const scraper = new ThreadsScraper();

console.log("=== Threads Monitor Worker ===");
console.log("Starting worker process...");

// ─── Scraping Job (every 5 minutes) ─────────────────────────────────────────

cron.schedule("*/5 * * * *", async () => {
    console.log("\n[Scraper] Running scheduled scrape...");

    try {
        const workspaces = await prisma.workspace.findMany({
            where: { isActive: true },
        });

        if (workspaces.length === 0) {
            console.log("[Scraper] No active workspaces. Nothing to do.");
            return;
        }

        for (const ws of workspaces) {
            console.log(`\n[Scraper] === Workspace: ${ws.name} ===`);

            if (ws.targetAccounts.length === 0) {
                console.log(`[Scraper] No target accounts configured. Skipping.`);
                continue;
            }

            // Check daily limit — if reached, skip translation to save API quota
            const postsToday = await getDailyPublishCount(ws.id);
            const limitReached = postsToday >= ws.dailyPostLimit;
            if (limitReached) {
                console.log(`[Scraper] Daily limit reached (${postsToday}/${ws.dailyPostLimit}). Translation will be skipped.`);
            }

            const settings: WorkspaceSettings = {
                translationPrompt: ws.translationPrompt,
                hotScoreThreshold: ws.hotScoreThreshold,
            };

            for (const username of ws.targetAccounts) {
                console.log(`[Scraper] Scraping @${username}...`);

                // Rate limit delay
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));

                try {
                    const posts = await scraper.scrapeAccount(username);
                    console.log(`[Scraper] Found ${posts.length} posts for @${username}`);

                    for (const post of posts) {
                        if (!post.content && (!post.mediaUrls || post.mediaUrls.length === 0)) continue;

                        const savedPost = await processPost(
                            post,
                            username,
                            ws.id,
                            settings,
                            { skipTranslation: limitReached }
                        );

                        if (!savedPost) {
                            console.log(`[Scraper]   - ${post.threadId} already exists (stats updated)`);
                        } else {
                            console.log(`[Scraper]   + New: ${savedPost.threadId} (score: ${savedPost.hotScore})`);

                            // Upload media to GCS if present
                            if (savedPost.mediaUrls) {
                                const mediaItems = Array.isArray(savedPost.mediaUrls) ? savedPost.mediaUrls : [];
                                if (mediaItems.length > 0) {
                                    try {
                                        const firstItem = mediaItems[0] as { url: string; type: string };
                                        const extension = firstItem.type === "video" ? ".mp4" : ".jpg";
                                        const filename = `scraped/${Date.now()}_${savedPost.id}${extension}`;
                                        const gcsUrl = await uploadMediaToGCS(firstItem.url, filename);
                                        console.log(`[Scraper]   📎 Media uploaded: ${gcsUrl}`);
                                    } catch (mediaErr) {
                                        console.error(`[Scraper]   ⚠ Media upload failed:`, mediaErr);
                                    }
                                }
                            }
                        }
                    }
                } catch (err) {
                    console.error(`[Scraper] Failed to scrape @${username}:`, err);
                }
            }
        }
    } catch (error) {
        console.error("[Scraper] Error in scraping job:", error);
    }
});

// ─── Publishing Job (every 10 minutes) ──────────────────────────────────────

cron.schedule("*/10 * * * *", async () => {
    console.log("\n[Publisher] Running scheduled publish check...");

    try {
        const workspaces = await prisma.workspace.findMany({
            where: {
                isActive: true,
                threadsToken: { not: null },
            },
        });

        for (const ws of workspaces) {
            if (!ws.threadsAppId || !ws.threadsToken) {
                console.log(`[Publisher] Workspace "${ws.name}" has no Threads credentials. Skipping.`);
                continue;
            }

            await checkAndPublishApprovedPosts({
                workspaceId: ws.id,
                threadsUserId: ws.threadsAppId,
                threadsAccessToken: ws.threadsToken,
                translationPrompt: ws.translationPrompt,
                dailyLimit: ws.dailyPostLimit,
            });
        }
    } catch (error) {
        console.error("[Publisher] Error in publishing job:", error);
    }
});

console.log("Worker started. Cron jobs:");
console.log("  - Scraper:   every 5 minutes");
console.log("  - Publisher:  every 10 minutes");
console.log("Waiting for next scheduled run...\n");
