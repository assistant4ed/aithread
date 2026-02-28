import { prisma } from "../lib/prisma";
import { Prisma, Workspace } from "@prisma/client";

type WorkspaceWithSources = Prisma.WorkspaceGetPayload<{ include: { sources: true } }>;
import { scrapeQueue, ScrapeJobData, removePendingScrapes } from "../lib/queue";
import { WorkspaceSettings } from "../lib/processor";
import { checkAndPublishApprovedPosts, getDailyPublishCount } from "../lib/publisher_service";
import { runSynthesisEngine } from "../lib/synthesis_engine";
import { trackPipelineRun } from "../lib/pipeline_tracker";
import { deleteBlobFromStorage } from "../lib/storage";
import { toUTCDate } from "../lib/time";

console.log("=== Threads Monitor Worker (Heartbeat) ===");
console.log("Starting worker process...");

/**
 * HEARTBEAT CRON: Runs every minute to check all workspaces.
 * A workspace's schedule is derived from its `publishTimes` (e.g. ["12:00", "18:00"]).
 * 
 * Pipeline logic:
 * 1. Publish Time (T)
 * 2. Review Window (R hours) -> Synthesis Time = T - R
 * 3. Scrape Window -> Starts at Synthesis - 2h, ends at Synthesis - 30m.
 *    We trigger scrapes at: start, start+30m, start+60m (3 batches per window).
 */
// ─── Custom Cron Scheduler ────────────────────────────────────────────────────
let isHeartbeatRunning = false;
let lastMinuteChecked = -1;

setInterval(() => {
    const now = new Date();
    const currentMinute = now.getMinutes();

    // Only run exactly once per minute tick
    if (currentMinute === lastMinuteChecked) return;
    lastMinuteChecked = currentMinute;

    // ── Execute the tick in the background without blocking the clock loop ──
    setImmediate(async () => {
        if (isHeartbeatRunning) {
            console.warn("[Heartbeat] ⚠️ Previous tick still running, skipping.");
            return;
        }
        isHeartbeatRunning = true;

        // Always use HKT (Asia/Hong_Kong) for logging current time to match user schedule
        const currentHHMM = now.toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "Asia/Hong_Kong"
        });

        console.log(`\n[Heartbeat] ${currentHHMM} - Checking workspaces...`);

        try {
            const startDb = Date.now();
            const workspaces = await prisma.workspace.findMany({
                where: { isActive: true },
                include: { sources: true },
            });

            if (workspaces.length === 0) {
                console.log("[Heartbeat] No active workspaces found in DB.");
                return;
            }

            const elapsedDb = Date.now() - startDb;
            console.log(`[Heartbeat] Processing ${workspaces.length} active workspace(s)... (DB: ${elapsedDb}ms)`);

            const startLoop = Date.now();

            // Use Promise.all to process workspaces concurrently, preventing one workspace
            // from blocking the heartbeat execution for others or node-cron.
            await Promise.all(workspaces.map(async (ws) => {
                // 1. Initial Scrape for new/never-scraped workspaces
                if (!ws.lastScrapedAt) {
                    console.log(`[Heartbeat] 🆕 New workspace detected (${ws.name}). Triggering initial scrape...`);
                    // Fire-and-forget — explicitly detach from the awaited chain
                    setImmediate(() => runScrape(ws).catch(e => console.error(`[Scrape Error - ${ws.name}]`, e)));
                }

                const publishTimes = ws.publishTimes && ws.publishTimes.length > 0
                    ? ws.publishTimes
                    : ["12:00", "18:00", "22:00"];

                const reviewWindow = ws.reviewWindowHours || 1;

                // Asynchronously fetch and log post counts so we don't block the heartbeat loop
                prisma.post.count({
                    where: {
                        workspaceId: ws.id,
                        createdAt: { gte: new Date(Date.now() - 86_400_000) }
                    }
                }).then(posts24h => {
                    console.log(`  - [${ws.name}] Last Scrape: ${ws.lastScrapedAt?.toLocaleTimeString() || "Never"} | Posts (24h): ${posts24h}`);
                }).catch(() => { });

                // Check each cycle for this workspace
                let publishTriggered = false;
                for (const timeStr of publishTimes) {
                    // Convert HKT publish time string to a UTC Date for reliable comparison
                    const pubDateUTC = toUTCDate(timeStr, now);

                    // --- SCRAPE PHASE ---
                    // Window: (Publish - ReviewWindow - 2h) to (Publish - ReviewWindow)
                    const synthDateUTC = new Date(pubDateUTC);
                    synthDateUTC.setHours(synthDateUTC.getHours() - reviewWindow);

                    const scrapeWindowStartUTC = new Date(synthDateUTC);
                    scrapeWindowStartUTC.setHours(scrapeWindowStartUTC.getHours() - 2);

                    const isWithinScrapeWindow = now >= scrapeWindowStartUTC && now < synthDateUTC;
                    const minutesSinceLastScrape = ws.lastScrapedAt
                        ? (now.getTime() - ws.lastScrapedAt.getTime()) / 60_000
                        : 999;

                    // ── Each phase is truly fire-and-forget via setImmediate ──────
                    // Trigger if in window and haven't scraped in last 28 mins (allow slight drift)
                    if (isWithinScrapeWindow && minutesSinceLastScrape >= 28) {
                        console.log(`[Heartbeat] 🕷️ Triggering SCRAPE for ${ws.name} (Window: ${timeStr} HKT, Last: ${Math.round(minutesSinceLastScrape)}m ago)`);
                        setImmediate(() => runScrape(ws).catch(e => console.error(`[Scrape Error - ${ws.name}]`, e)));
                    }

                    // --- SYNTHESIS PHASE ---
                    // Use UTC comparison for stability
                    const isSynthTime =
                        now.getUTCHours() === synthDateUTC.getUTCHours() &&
                        now.getUTCMinutes() === synthDateUTC.getUTCMinutes();

                    if (isSynthTime) {
                        console.log(`[Heartbeat] 🧠 Triggering SYNTHESIS for ${ws.name} (Target Publish: ${timeStr} HKT)`);
                        setImmediate(() => runSynthesis(ws, timeStr).catch(e => console.error(`[Synthesis Error - ${ws.name}]`, e)));
                    }

                    // --- PUBLISH PHASE ---
                    const isPublishTime =
                        now.getUTCHours() === pubDateUTC.getUTCHours() &&
                        now.getUTCMinutes() === pubDateUTC.getUTCMinutes();

                    if (isPublishTime) {
                        console.log(`[Heartbeat] 🚀 Triggering PUBLISH for ${ws.name} (Time: ${timeStr} HKT)`);
                        setImmediate(() => runPublish(ws).catch(e => console.error(`[Publish Error - ${ws.name}]`, e)));
                        publishTriggered = true;
                    }
                }

                // --- SCHEDULED ARTICLE CHECK (independent of publishTimes) ---
                // Catch any approved articles whose scheduledPublishAt has passed
                // Skip if we already triggered publish via publishTimes this tick to avoid duplicate posts
                if (!publishTriggered) {
                    const overdueCount = await prisma.synthesizedArticle.count({
                        where: {
                            workspaceId: ws.id,
                            status: "APPROVED",
                            scheduledPublishAt: { lte: now },
                        },
                    });
                    if (overdueCount > 0) {
                        console.log(`[Heartbeat] ⏰ ${overdueCount} overdue scheduled article(s) for ${ws.name}. Triggering publish...`);
                        setImmediate(() => runPublish(ws).catch(e => console.error(`[Publish Error - ${ws.name}]`, e)));
                    }
                }
            }));

            const elapsedLoop = Date.now() - startLoop;
            if (elapsedLoop > 500) {
                console.log(`[Heartbeat] ⚠️ Loop took ${elapsedLoop}ms!`);
            }

            // Once per day (at 00:00 HKT), prune old records
            if (currentHHMM === "00:00") {
                const sevenDaysAgo = new Date(Date.now() - 7 * 86_400_000);
                prisma.pipelineRun.deleteMany({
                    where: { startedAt: { lt: sevenDaysAgo } },
                }).then(deleted => {
                    if (deleted.count > 0) {
                        console.log(`[Heartbeat] 🧹 Pruned ${deleted.count} old pipeline run records.`);
                    }
                }).catch(e => console.error("[Heartbeat] Pipeline pruning failed:", e));

                pruneOldPosts().catch(e => console.error("[Heartbeat] Post pruning failed:", e));
            }

        } catch (error) {
            console.error("[Heartbeat] Error:", error);
        } finally {
            isHeartbeatRunning = false;
        }
    });
}, 1000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runScrape(ws: WorkspaceWithSources) {
    return trackPipelineRun(ws.id, "SCRAPE", async () => {
        const sources = ws.sources || [];

        if (sources.length === 0) return { jobsEnqueued: 0 };

        console.log(`[Scrape] Starting cycle for ${ws.name}...`);

        // Update tracking
        await prisma.workspace.update({
            where: { id: ws.id },
            data: { lastScrapedAt: new Date() }
        });

        const postsToday = await getDailyPublishCount(ws.id);
        const limitReached = postsToday >= ws.dailyPostLimit;

        if (limitReached) {
            console.log(`[Scrape] Daily limit reached (${postsToday}/${ws.dailyPostLimit}). Translation will be skipped.`);
        }

        const settings: WorkspaceSettings = {
            translationPrompt: ws.translationPrompt || "",
            hotScoreThreshold: ws.hotScoreThreshold,
            topicFilter: ws.topicFilter,
            maxPostAgeHours: ws.maxPostAgeHours,
            aiProvider: ws.aiProvider,
            aiModel: ws.aiModel,
            aiApiKey: ws.aiApiKey,
        };

        let count = 0;

        // 1. Process ScraperSource (New System)
        for (const source of sources) {
            if (!source.isActive) continue;

            const jobData: ScrapeJobData = {
                target: source.value,
                type: source.type,
                workspaceId: ws.id,
                settings,
                skipTranslation: limitReached,
                sourceId: source.id,
            };

            await scrapeQueue.add(`scrape:${ws.id}:${source.id}`, jobData, {
                jobId: `scrape:${ws.id}:${source.id}`, // Deduplication
                removeOnComplete: true,
                removeOnFail: { count: 100 },
                attempts: 2,
                backoff: { type: 'fixed', delay: 5000 },
            });
            count++;
        }

        console.log(`[Scrape] Enqueued ${count} jobs for ${ws.name}.`);

        // Capture useful diagnostic metadata
        const twoHoursAgo = new Date(Date.now() - 2 * 3600000);
        const [recentPosts, totalPending, scrapeStats] = await Promise.all([
            prisma.post.count({
                where: {
                    workspaceId: ws.id,
                    createdAt: { gte: new Date(Date.now() - 86400000) } // Last 24h
                }
            }),
            prisma.post.count({
                where: {
                    workspaceId: ws.id,
                    status: "PENDING_REVIEW",
                }
            }),
            prisma.scrapeLog.aggregate({
                where: {
                    sourceId: { in: sources.map(s => s.id) },
                    createdAt: { gte: twoHoursAgo }
                },
                _sum: {
                    rawCollected: true,
                    qualified: true,
                    failedFreshness: true,
                    failedEngagement: true,
                    unknownFollowers: true
                }
            })
        ]);

        return {
            jobsEnqueued: count,
            sourcesTotal: sources.length,
            postsLast24h: recentPosts,
            totalPending,
            limitReached,
            // Add aggregated stats from the last 2 hours
            stats2h: {
                rawCollected: scrapeStats._sum.rawCollected || 0,
                qualified: scrapeStats._sum.qualified || 0,
                failedFreshness: scrapeStats._sum.failedFreshness || 0,
                failedEngagement: scrapeStats._sum.failedEngagement || 0,
            }
        };
    });
}

async function runSynthesis(ws: Workspace, targetPublishTime: string) {
    return trackPipelineRun(ws.id, "SYNTHESIS", async () => {
        console.log(`[Synthesis] Starting synthesis for ${ws.id}. Clearing pending scrape jobs...`);
        await removePendingScrapes(ws.id);

        await prisma.workspace.update({
            where: { id: ws.id },
            data: { lastSynthesizedAt: new Date() }
        });

        const publishTimes = ws.publishTimes?.length ? ws.publishTimes : ["12:00", "18:00", "22:00"];
        const maxArticles = Math.ceil(ws.dailyPostLimit / publishTimes.length);

        const result = await runSynthesisEngine(ws.id, {
            translationPrompt: ws.translationPrompt || "",
            clusteringPrompt: ws.clusteringPrompt || "",
            synthesisLanguage: ws.synthesisLanguage || "Traditional Chinese (HK/TW)",
            postLookbackHours: ws.postLookbackHours,
            targetPublishTimeStr: targetPublishTime,
            hotScoreThreshold: ws.hotScoreThreshold,
            coherenceThreshold: ws.coherenceThreshold,
            aiProvider: ws.aiProvider || "GROQ",
            aiModel: ws.aiModel || "llama-3.3-70b-versatile",
            aiApiKey: ws.aiApiKey || undefined,
            maxArticles,
        });

        // ── Stagger articles across remaining publish windows ──
        // Prevents all articles from the same synthesis run publishing simultaneously.
        if (result.articlesGenerated > 1) {
            await staggerArticleSchedules(ws, targetPublishTime);
        }

        return result;
    });
}

/**
 * After synthesis creates multiple articles for the same publish time,
 * redistribute them across the remaining publish windows for the day
 * so they don't all fire at once.
 *
 * Example: 3 articles all at 12:00 → article1@12:00, article2@18:00, article3@22:00
 */
export async function staggerArticleSchedules(ws: Workspace, targetPublishTime: string) {
    const publishTimes = ws.publishTimes && ws.publishTimes.length > 0
        ? ws.publishTimes
        : ["12:00", "18:00", "22:00"];

    const now = new Date();
    const targetUTC = toUTCDate(targetPublishTime, now);

    // Build a list of publish slots from now onwards (today + tomorrow)
    const slots: Date[] = [];
    for (const timeStr of publishTimes) {
        const slotUTC = toUTCDate(timeStr, now);
        if (slotUTC > targetUTC) {
            slots.push(slotUTC); // Remaining today
        }
    }
    // Also add tomorrow's slots as overflow
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    for (const timeStr of publishTimes) {
        slots.push(toUTCDate(timeStr, tomorrow));
    }

    // Find articles just created for this publish time (APPROVED or PENDING_REVIEW + same scheduledPublishAt)
    const articles = await prisma.synthesizedArticle.findMany({
        where: {
            workspaceId: ws.id,
            status: { in: ["APPROVED", "PENDING_REVIEW"] },
            scheduledPublishAt: targetUTC,
        },
        orderBy: { createdAt: "asc" },
    });

    if (articles.length <= 1) return; // Nothing to stagger

    // First article keeps the original time; reassign the rest
    for (let i = 1; i < articles.length; i++) {
        const newSlot = slots[i - 1]; // slots[0] = next window after target
        if (!newSlot) break; // No more slots available

        await prisma.synthesizedArticle.update({
            where: { id: articles[i].id },
            data: { scheduledPublishAt: newSlot },
        });

        const slotHKT = newSlot.toLocaleTimeString("en-GB", {
            hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong"
        });
        console.log(`[Stagger] Article ${articles[i].id} rescheduled: ${targetPublishTime} → ${slotHKT} HKT`);
    }

    console.log(`[Stagger] Distributed ${articles.length} articles across ${Math.min(articles.length, slots.length + 1)} time slots.`);
}

async function runPublish(ws: Workspace) {
    return trackPipelineRun(ws.id, "PUBLISH", async () => {
        if (!ws.threadsAppId || !ws.threadsToken) {
            console.log(`[Publish] Skipping ${ws.name} (No credentials)`);
            return { skipped: true, reason: "No credentials" };
        }

        await prisma.workspace.update({
            where: { id: ws.id },
            data: { lastPublishedAt: new Date() }
        });

        return await checkAndPublishApprovedPosts({
            workspaceId: ws.id,
            threadsUserId: ws.threadsAppId,
            threadsAccessToken: ws.threadsToken || undefined,
            instagramAccountId: ws.instagramAccountId || undefined,
            instagramAccessToken: ws.instagramAccessToken || undefined,
            twitterApiKey: ws.twitterApiKey || undefined,
            twitterApiSecret: ws.twitterApiSecret || undefined,
            twitterAccessToken: ws.twitterAccessToken || undefined,
            twitterAccessSecret: ws.twitterAccessSecret || undefined,
            translationPrompt: ws.translationPrompt || "",
            dailyLimit: ws.dailyPostLimit,
            aiProvider: ws.aiProvider,
            aiModel: ws.aiModel,
            aiApiKey: ws.aiApiKey,
        });
    });
}

async function pruneOldPosts() {
    console.log("[Prune] Starting daily post and media cleanup...");

    // Default: Prune everything older than 30 days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

    try {
        // 1. Find posts to prune
        const posts = await prisma.post.findMany({
            where: { createdAt: { lt: thirtyDaysAgo } },
            select: { id: true, mediaUrls: true }
        });

        if (posts.length === 0) {
            console.log("[Prune] No old posts found.");
            return;
        }

        console.log(`[Prune] Found ${posts.length} posts to prune.`);

        // 2. Identify and delete associated blobs
        for (const post of posts) {
            const media = post.mediaUrls as any[];
            if (media && Array.isArray(media)) {
                for (const item of media) {
                    if (item.url && item.url.includes(".blob.core.windows.net")) {
                        // Extract filename from URL
                        // e.g. https://account.blob.core.windows.net/media/some-file.jpg
                        const filename = item.url.split("/").pop();
                        if (filename) {
                            await deleteBlobFromStorage(filename);
                        }
                    }
                }
            }
        }

        // 3. Delete DB records
        const deleted = await prisma.post.deleteMany({
            where: { id: { in: posts.map(p => p.id) } }
        });

        console.log(`[Prune] Successfully deleted ${deleted.count} post records.`);
    } catch (error) {
        console.error("[Prune] Error during cleanup:", error);
    }
}

console.log("Worker started. Waiting for next minute tick...");
