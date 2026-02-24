import "dotenv/config";
import { prisma } from "../lib/prisma";
import { scrapeQueue, ScrapeJobData, removePendingScrapes } from "../lib/queue";
import { WorkspaceSettings } from "../lib/processor";
import { checkAndPublishApprovedPosts, getDailyPublishCount } from "../lib/publisher_service";
import { runSynthesisEngine } from "../lib/synthesis_engine";

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

        const currentHHMM = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

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
                for (const timeStr of publishTimes) {
                    const [pubH, pubM] = timeStr.split(":").map(Number);

                    // --- SCRAPE PHASE ---
                    // Window: (Publish - ReviewWindow - 2h) to (Publish - ReviewWindow)
                    const synthDate = new Date(now);
                    synthDate.setHours(pubH - reviewWindow, pubM, 0, 0);

                    const scrapeWindowStart = new Date(synthDate);
                    scrapeWindowStart.setHours(scrapeWindowStart.getHours() - 2);

                    const isWithinScrapeWindow = now >= scrapeWindowStart && now < synthDate;
                    const minutesSinceLastScrape = ws.lastScrapedAt
                        ? (now.getTime() - ws.lastScrapedAt.getTime()) / 60_000
                        : 999;

                    // ── Each phase is truly fire-and-forget via setImmediate ──────
                    // Trigger if in window and haven't scraped in last 28 mins (allow slight drift)
                    if (isWithinScrapeWindow && minutesSinceLastScrape >= 28) {
                        console.log(`[Heartbeat] 🕷️ Triggering SCRAPE for ${ws.name} (Window: ${timeStr}, Last: ${Math.round(minutesSinceLastScrape)}m ago)`);
                        setImmediate(() => runScrape(ws).catch(e => console.error(`[Scrape Error - ${ws.name}]`, e)));
                    }

                    // --- SYNTHESIS PHASE ---
                    const synthHHMM = synthDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                    if (currentHHMM === synthHHMM) {
                        console.log(`[Heartbeat] 🧠 Triggering SYNTHESIS for ${ws.name} (Target Publish: ${timeStr})`);
                        setImmediate(() => runSynthesis(ws, timeStr).catch(e => console.error(`[Synthesis Error - ${ws.name}]`, e)));
                    }

                    // --- PUBLISH PHASE ---
                    if (currentHHMM === timeStr) {
                        console.log(`[Heartbeat] 🚀 Triggering PUBLISH for ${ws.name} (Time: ${timeStr})`);
                        setImmediate(() => runPublish(ws).catch(e => console.error(`[Publish Error - ${ws.name}]`, e)));
                    }
                }

                // --- SCHEDULED ARTICLE CHECK (independent of publishTimes) ---
                // Catch any approved articles whose scheduledPublishAt has passed
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
            }));

            const elapsedLoop = Date.now() - startLoop;
            if (elapsedLoop > 500) {
                console.log(`[Heartbeat] ⚠️ Loop took ${elapsedLoop}ms!`);
            }

        } catch (error) {
            console.error("[Heartbeat] Error:", error);
        } finally {
            isHeartbeatRunning = false;
        }
    });
}, 1000);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runScrape(ws: any) {
    const sources = ws.sources || [];

    if (sources.length === 0) return;

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
        translationPrompt: ws.translationPrompt,
        hotScoreThreshold: ws.hotScoreThreshold,
        topicFilter: ws.topicFilter,
        maxPostAgeHours: ws.maxPostAgeHours,
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

        await scrapeQueue.add(`scrape-${source.id}-${Date.now()}`, jobData, {
            removeOnComplete: true,
            removeOnFail: { count: 100 },
        });
        count++;
    }

    console.log(`[Scrape] Enqueued ${count} jobs for ${ws.name}.`);
}

async function runSynthesis(ws: any, targetPublishTime: string) {
    console.log(`[Synthesis] Starting synthesis for ${ws.id}. Clearing pending scrape jobs...`);
    await removePendingScrapes(ws.id);

    await prisma.workspace.update({
        where: { id: ws.id },
        data: { lastSynthesizedAt: new Date() }
    });

    await runSynthesisEngine(ws.id, {
        translationPrompt: ws.translationPrompt,
        clusteringPrompt: ws.clusteringPrompt,
        synthesisLanguage: ws.synthesisLanguage,
        postLookbackHours: ws.postLookbackHours,
        targetPublishTimeStr: targetPublishTime,
        hotScoreThreshold: ws.hotScoreThreshold,
        coherenceThreshold: (ws as any).coherenceThreshold,
        aiProvider: (ws as any).aiProvider,
        aiModel: (ws as any).aiModel,
        aiApiKey: (ws as any).aiApiKey,
    });
}

async function runPublish(ws: any) {
    if (!ws.threadsAppId || !ws.threadsToken) {
        console.log(`[Publish] Skipping ${ws.name} (No credentials)`);
        return;
    }

    await prisma.workspace.update({
        where: { id: ws.id },
        data: { lastPublishedAt: new Date() }
    });

    await checkAndPublishApprovedPosts({
        workspaceId: ws.id,
        threadsUserId: ws.threadsAppId,
        threadsAccessToken: ws.threadsToken,
        instagramAccountId: ws.instagramAccountId,
        instagramAccessToken: ws.instagramAccessToken,
        twitterApiKey: ws.twitterApiKey,
        twitterApiSecret: ws.twitterApiSecret,
        twitterAccessToken: ws.twitterAccessToken,
        twitterAccessSecret: ws.twitterAccessSecret,
        translationPrompt: ws.translationPrompt,
        dailyLimit: ws.dailyPostLimit,
    });
}

console.log("Worker started. Waiting for next minute tick...");
