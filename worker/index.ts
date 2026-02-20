import "dotenv/config";
import cron from "node-cron";
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
cron.schedule("* * * * *", async () => {
    const now = new Date();
    const currentHHMM = now.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
    // ^ "HH:MM" format (24h)

    console.log(`\n[Heartbeat] ${currentHHMM} - Checking workspaces...`);

    try {
        const workspaces = await prisma.workspace.findMany({
            where: { isActive: true },
            include: { sources: true },
        });

        if (workspaces.length === 0) {
            console.log("[Heartbeat] No active workspaces found in DB.");
            return;
        }

        console.log(`[Heartbeat] Processing ${workspaces.length} active workspace(s)...`);

        for (const ws of workspaces) {
            // 1. Initial Scrape for new/never-scraped workspaces
            if (!ws.lastScrapedAt) {
                console.log(`[Heartbeat] 🆕 New workspace detected (${ws.name}). Triggering initial scrape...`);
                await runScrape(ws);
                // We continue to allow other phases (like synthesis) if they happen to match, 
                // but usually the first scrape needs minutes to complete.
            }

            const publishTimes = ws.publishTimes && ws.publishTimes.length > 0
                ? ws.publishTimes
                : ["12:00", "18:00", "22:00"];

            const reviewWindow = ws.reviewWindowHours || 1;
            console.log(`  - [${ws.name}] Last Scrape: ${ws.lastScrapedAt?.toLocaleTimeString() || "Never"}`);

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
                    ? (now.getTime() - ws.lastScrapedAt.getTime()) / (1000 * 60)
                    : 999;

                // Trigger if in window and haven't scraped in last 28 mins (allow slight drift)
                if (isWithinScrapeWindow && minutesSinceLastScrape >= 28) {
                    console.log(`[Heartbeat] 🕷️ Triggering SCRAPE for ${ws.name} (Window: ${timeStr}, Last: ${Math.round(minutesSinceLastScrape)}m ago)`);
                    await runScrape(ws);
                }

                // --- SYNTHESIS PHASE ---
                const synthHHMM = synthDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                if (currentHHMM === synthHHMM) {
                    console.log(`[Heartbeat] 🧠 Triggering SYNTHESIS for ${ws.name} (Target Publish: ${timeStr})`);
                    await runSynthesis(ws, timeStr);
                }

                // --- PUBLISH PHASE ---
                if (currentHHMM === timeStr) {
                    console.log(`[Heartbeat] � Triggering PUBLISH for ${ws.name} (Time: ${timeStr})`);
                    await runPublish(ws);
                }
            }
        }

    } catch (error) {
        console.error("[Heartbeat] Error:", error);
    }
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function runScrape(ws: any) {
    const sources = ws.sources || [];
    const legacyAccounts = ws.targetAccounts || [];

    if (sources.length === 0 && legacyAccounts.length === 0) return;

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

    // 2. Process legacy targetAccounts (Backward Compatibility)
    for (const username of legacyAccounts) {
        // Skip if already in sources as an ACCOUNT
        if (sources.some((s: any) => s.type === 'ACCOUNT' && s.value === username)) continue;

        const jobData: ScrapeJobData = {
            target: username,
            type: 'ACCOUNT',
            workspaceId: ws.id,
            settings,
            skipTranslation: limitReached,
        };

        await scrapeQueue.add(`scrape-legacy-${ws.id}-${username}-${Date.now()}`, jobData, {
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
        targetPublishTimeStr: targetPublishTime
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
