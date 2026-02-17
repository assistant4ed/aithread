import "dotenv/config";
import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { scrapeQueue, ScrapeJobData } from "../lib/queue";
import { WorkspaceSettings } from "../lib/processor";
import { checkAndPublishApprovedPosts, getDailyPublishCount } from "../lib/publisher_service";

console.log("=== Threads Monitor Worker (Producer) ===");
console.log("Starting worker process...");

// ─── Scraping Job (every 5 minutes) — PRODUCER ──────────────────────────────
// Instead of scraping directly, this job enqueues one BullMQ job per account.
// The actual scraping happens in worker/scrape-worker.ts (the consumer).

cron.schedule("*/5 * * * *", async () => {
    console.log("\n[Producer] Enqueuing scrape jobs...");

    try {
        const workspaces = await prisma.workspace.findMany({
            where: { isActive: true },
        });

        if (workspaces.length === 0) {
            console.log("[Producer] No active workspaces. Nothing to do.");
            return;
        }

        let totalJobs = 0;

        for (const ws of workspaces) {
            console.log(`\n[Producer] === Workspace: ${ws.name} ===`);

            if (ws.targetAccounts.length === 0) {
                console.log(`[Producer] No target accounts configured. Skipping.`);
                continue;
            }

            // Check daily limit — if reached, skip translation to save API quota
            const postsToday = await getDailyPublishCount(ws.id);
            const limitReached = postsToday >= ws.dailyPostLimit;
            if (limitReached) {
                console.log(`[Producer] Daily limit reached (${postsToday}/${ws.dailyPostLimit}). Translation will be skipped.`);
            }

            const settings: WorkspaceSettings = {
                translationPrompt: ws.translationPrompt,
                hotScoreThreshold: ws.hotScoreThreshold,
                topicFilter: ws.topicFilter,
                maxPostAgeHours: ws.maxPostAgeHours,
            };

            // Enqueue one job per target account
            for (const username of ws.targetAccounts) {
                const jobData: ScrapeJobData = {
                    username,
                    workspaceId: ws.id,
                    settings,
                    skipTranslation: limitReached,
                };

                await scrapeQueue.add(
                    "scrape-account",
                    jobData,
                    {
                        // Deduplicate: if a job for this account is already in the queue, skip it?
                        // FIX: Previously we used a static ID, which meant after one success, 
                        // subsequent jobs were ignored by BullMQ as duplicates.
                        // Now using a timestamp to ensure a fresh job is added every cycle.
                        jobId: `scrape-${ws.id}-${username}-${Date.now()}`,
                        removeOnComplete: true, // Auto-remove to keep Redis clean
                        removeOnFail: { count: 100 }, // Keep last 100 failures
                    }
                );
                totalJobs++;
            }
        }

        console.log(`[Producer] Enqueued ${totalJobs} scrape jobs.`);
    } catch (error) {
        console.error("[Producer] Error enqueuing scrape jobs:", error);
    }
});

// ─── Publishing Job (every 10 minutes) ──────────────────────────────────────
// Publisher stays as-is — low volume, no parallelism needed.

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

// ─── Synthesis Job (every 30 minutes) ──────────────────────────────────────
import { runSynthesisEngine } from "../lib/synthesis_engine";

cron.schedule("*/30 * * * *", async () => {
    console.log("\n[Synthesis] Running scheduled synthesis check...");

    try {
        const workspaces = await prisma.workspace.findMany({
            where: { isActive: true },
        });

        for (const ws of workspaces) {
            await runSynthesisEngine(ws.id, {
                translationPrompt: ws.translationPrompt,
                synthesisLanguage: ws.synthesisLanguage,
            });
        }
    } catch (error) {
        console.error("[Synthesis] Error in synthesis job:", error);
    }
});

console.log("Worker started. Cron jobs:");
console.log("  - Producer:   every 5 minutes (enqueues scrape jobs to Redis)");
console.log("  - Publisher:  every 10 minutes");
console.log("Waiting for next scheduled run...\n");
