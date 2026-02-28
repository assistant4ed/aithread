/**
 * Scrape Pipeline Operational Test — Singapore Deployment
 *
 * Tests 4 critical areas end-to-end against the live deployment:
 *   Test 1: Account Scraper — verify posts with engagement metrics
 *   Test 2: Topic/Hashtag Scraper — verify topic posts + author discovery
 *   Test 3: Media Enrichment & Video Extraction — verify Azure Blob uploads
 *   Test 4: Bot Detection & Singapore IP Health — verify no 403s/blocks
 *
 * Usage:
 *   npx tsx scripts/ops_test_sg.ts baseline     — Step 1: Capture pre-scrape baseline
 *   npx tsx scripts/ops_test_sg.ts verify       — Step 2: Verify post-scrape results
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const WORKSPACE_NAME = "HKParties";
const BLOB_HOST = "threadsmonitorblobs.blob.core.windows.net";

// ─── Formatting Helpers ─────────────────────────────────────────────────────

function header(title: string) {
    const line = "═".repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(`${line}\n`);
}

function pass(msg: string) { console.log(`  [PASS] ${msg}`); }
function fail(msg: string) { console.log(`  [FAIL] ${msg}`); }
function info(msg: string) { console.log(`  [INFO] ${msg}`); }
function warn(msg: string) { console.log(`  [WARN] ${msg}`); }

// ─── Baseline: Pre-Scrape State ─────────────────────────────────────────────

async function baseline() {
    header("SCRAPE PIPELINE OPERATIONAL TEST — BASELINE CAPTURE");

    // 1. Find workspace
    const ws = await prisma.workspace.findFirst({
        where: { OR: [{ id: WORKSPACE_NAME }, { name: WORKSPACE_NAME }] },
        include: { sources: true },
    });

    if (!ws) {
        fail(`Workspace "${WORKSPACE_NAME}" not found`);
        return;
    }
    pass(`Workspace found: ${ws.name} (id: ${ws.id})`);

    // 2. List active sources
    const activeSources = ws.sources.filter(s => s.isActive);
    const accountSources = activeSources.filter(s => s.type === "ACCOUNT");
    const topicSources = activeSources.filter(s => s.type === "TOPIC");

    info(`Active sources: ${activeSources.length} total`);
    info(`  ACCOUNT sources: ${accountSources.length}`);
    for (const s of accountSources.slice(0, 10)) {
        info(`    - @${s.value} (minLikes: ${s.minLikes}, trustWeight: ${s.trustWeight})`);
    }
    if (accountSources.length > 10) info(`    ... and ${accountSources.length - 10} more`);

    info(`  TOPIC sources: ${topicSources.length}`);
    for (const s of topicSources) {
        info(`    - #${s.value} (minLikes: ${s.minLikes})`);
    }

    if (accountSources.length === 0) {
        fail("No active ACCOUNT sources — Test 1 cannot proceed");
    } else {
        pass(`ACCOUNT sources available for Test 1`);
    }

    if (topicSources.length === 0) {
        fail("No active TOPIC sources — Test 2 cannot proceed");
    } else {
        pass(`TOPIC sources available for Test 2`);
    }

    // 3. Baseline: recent ScrapeLog entries
    header("BASELINE — SCRAPE LOG (last 24h)");

    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentLogs = await prisma.scrapeLog.findMany({
        where: { createdAt: { gte: since24h } },
        orderBy: { createdAt: "desc" },
        take: 20,
    });

    info(`ScrapeLog entries in last 24h: ${recentLogs.length}`);
    for (const log of recentLogs.slice(0, 10)) {
        const sourceInfo = activeSources.find(s => s.id === log.sourceId);
        const label = sourceInfo ? `${sourceInfo.type}:${sourceInfo.value}` : log.sourceId;
        info(`  ${log.createdAt.toISOString()} | ${label} | raw: ${log.rawCollected}, qualified: ${log.qualified}, failedEng: ${log.failedEngagement}, failedFresh: ${log.failedFreshness}`);
    }

    // Flag any zero-collect entries (potential bot detection)
    const zeroCollects = recentLogs.filter(l => l.rawCollected === 0);
    if (zeroCollects.length > 0) {
        warn(`${zeroCollects.length} scrape logs with rawCollected=0 (potential blocks/errors)`);
        for (const z of zeroCollects.slice(0, 5)) {
            const sourceInfo = activeSources.find(s => s.id === z.sourceId);
            warn(`  ${z.createdAt.toISOString()} | ${sourceInfo?.type}:${sourceInfo?.value || z.sourceId}`);
        }
    } else {
        pass("No zero-collect scrape logs (no obvious blocks)");
    }

    // 4. Baseline: recent posts
    header("BASELINE — RECENT POSTS");

    const postCountBefore = await prisma.post.count({
        where: { workspaceId: ws.id },
    });
    info(`Total posts in workspace: ${postCountBefore}`);

    const recentPosts = await prisma.post.findMany({
        where: { workspaceId: ws.id, createdAt: { gte: since24h } },
        orderBy: { createdAt: "desc" },
        take: 5,
    });
    info(`Posts created in last 24h: ${recentPosts.length > 0 ? recentPosts.length + '+' : '0'}`);

    const postsLast24h = await prisma.post.count({
        where: { workspaceId: ws.id, createdAt: { gte: since24h } },
    });
    info(`Exact post count (last 24h): ${postsLast24h}`);

    // Save baseline timestamp for verify step
    const baselineTs = new Date().toISOString();
    info(`\nBaseline timestamp: ${baselineTs}`);
    info("Save this timestamp — pass it to 'verify' step after the scrape completes.");

    header("NEXT STEPS");
    info("1. Trigger scrape: npx tsx scripts/manual_scrape.ts HKParties");
    info("2. Monitor logs:   az containerapp logs show --name worker-scraper-sg --resource-group john-threads --follow");
    info("3. After completion: npx tsx scripts/ops_test_sg.ts verify <baseline_timestamp>");
}

// ─── Verify: Post-Scrape Validation ─────────────────────────────────────────

async function verify(baselineTimestamp?: string) {
    const since = baselineTimestamp ? new Date(baselineTimestamp) : new Date(Date.now() - 30 * 60 * 1000);

    header("SCRAPE PIPELINE OPERATIONAL TEST — VERIFICATION");
    info(`Checking for new data since: ${since.toISOString()}`);

    // Find workspace
    const ws = await prisma.workspace.findFirst({
        where: { OR: [{ id: WORKSPACE_NAME }, { name: WORKSPACE_NAME }] },
        include: { sources: true },
    });

    if (!ws) {
        fail(`Workspace "${WORKSPACE_NAME}" not found`);
        return;
    }

    const activeSources = ws.sources.filter(s => s.isActive);
    let testsPassed = 0;
    let testsFailed = 0;
    let testsWarning = 0;

    // ─── TEST 1: Account Scraper ──────────────────────────────────────────

    header("TEST 1: ACCOUNT SCRAPER");

    const accountPosts = await prisma.post.findMany({
        where: {
            workspaceId: ws.id,
            sourceType: "ACCOUNT",
            createdAt: { gte: since },
        },
        orderBy: { hotScore: "desc" },
        take: 20,
    });

    info(`New ACCOUNT posts since baseline: ${accountPosts.length}`);

    if (accountPosts.length === 0) {
        fail("No new ACCOUNT posts created — scraper may have failed");
        testsFailed++;
    } else {
        pass(`${accountPosts.length} new ACCOUNT posts created`);
        testsPassed++;

        // Check engagement metrics
        const withLikes = accountPosts.filter(p => p.likes > 0);
        const withViews = accountPosts.filter(p => p.views > 0);
        const withPostedAt = accountPosts.filter(p => p.postedAt !== null);
        const withHotScore = accountPosts.filter(p => p.hotScore > 0);
        const pendingReview = accountPosts.filter(p => p.status === "PENDING_REVIEW");

        if (withLikes.length > 0) {
            pass(`${withLikes.length}/${accountPosts.length} posts have likes > 0`);
            testsPassed++;
        } else {
            fail("All posts have 0 likes — metric extraction broken");
            testsFailed++;
        }

        if (withViews.length > 0) {
            pass(`${withViews.length}/${accountPosts.length} posts have views > 0`);
            testsPassed++;
        } else {
            warn("No posts with views > 0 — views may not be available in all regions");
            testsWarning++;
        }

        if (withPostedAt.length > 0) {
            pass(`${withPostedAt.length}/${accountPosts.length} posts have postedAt set`);
            testsPassed++;
        } else {
            fail("No posts have postedAt — time extraction broken");
            testsFailed++;
        }

        if (withHotScore.length > 0) {
            pass(`${withHotScore.length}/${accountPosts.length} posts have hotScore > 0 (scoring pipeline OK)`);
            testsPassed++;
        } else {
            fail("No posts have hotScore > 0 — scoring pipeline broken");
            testsFailed++;
        }

        if (pendingReview.length > 0) {
            pass(`${pendingReview.length}/${accountPosts.length} posts created with status PENDING_REVIEW`);
            testsPassed++;
        } else {
            fail("No posts with PENDING_REVIEW status");
            testsFailed++;
        }

        // Sample post details
        info("\nTop 3 ACCOUNT posts by hotScore:");
        for (const p of accountPosts.slice(0, 3)) {
            info(`  @${p.sourceAccount} | score: ${p.hotScore.toFixed(1)} | likes: ${p.likes} | replies: ${p.replies} | views: ${p.views}`);
            info(`    postedAt: ${p.postedAt?.toISOString() || 'null'} | threadId: ${p.threadId}`);
        }
    }

    // Check ScrapeLog for ACCOUNT sources
    const accountLogs = await prisma.scrapeLog.findMany({
        where: {
            sourceType: "ACCOUNT",
            createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
    });

    info(`\nScrapeLog entries (ACCOUNT) since baseline: ${accountLogs.length}`);
    const accountLogsWithData = accountLogs.filter(l => l.rawCollected > 0);
    const accountLogsQualified = accountLogs.filter(l => l.qualified > 0);

    if (accountLogsWithData.length > 0) {
        pass(`${accountLogsWithData.length}/${accountLogs.length} ACCOUNT scrapes collected data (rawCollected > 0)`);
        testsPassed++;
    } else if (accountLogs.length > 0) {
        fail("All ACCOUNT scrape logs have rawCollected=0");
        testsFailed++;
    }

    if (accountLogsQualified.length > 0) {
        pass(`${accountLogsQualified.length}/${accountLogs.length} ACCOUNT scrapes qualified posts`);
        testsPassed++;
    } else {
        warn("No ACCOUNT scrapes produced qualified posts (may be engagement threshold)");
        testsWarning++;
    }

    // ─── TEST 2: TOPIC/HASHTAG SCRAPER ────────────────────────────────────

    header("TEST 2: TOPIC/HASHTAG SCRAPER");

    const topicPosts = await prisma.post.findMany({
        where: {
            workspaceId: ws.id,
            sourceType: "TOPIC",
            createdAt: { gte: since },
        },
        orderBy: { hotScore: "desc" },
        take: 20,
    });

    info(`New TOPIC posts since baseline: ${topicPosts.length}`);

    if (topicPosts.length === 0) {
        warn("No new TOPIC posts — may be no active TOPIC sources or low engagement");
        testsWarning++;
    } else {
        pass(`${topicPosts.length} new TOPIC posts created`);
        testsPassed++;

        // Check sourceAccount populated (actual author, not hashtag)
        const withSourceAccount = topicPosts.filter(p => p.sourceAccount && !p.sourceAccount.startsWith("topic_"));
        if (withSourceAccount.length > 0) {
            pass(`${withSourceAccount.length}/${topicPosts.length} posts have real sourceAccount (not topic_ prefix)`);
            testsPassed++;
        } else {
            warn("All topic posts have generic sourceAccount — author extraction issue");
            testsWarning++;
        }

        info("\nTop 3 TOPIC posts by hotScore:");
        for (const p of topicPosts.slice(0, 3)) {
            info(`  @${p.sourceAccount} | score: ${p.hotScore.toFixed(1)} | likes: ${p.likes} | replies: ${p.replies} | views: ${p.views}`);
        }
    }

    // Check ScrapeLog for TOPIC sources
    const topicLogs = await prisma.scrapeLog.findMany({
        where: {
            sourceType: "TOPIC",
            createdAt: { gte: since },
        },
        orderBy: { createdAt: "desc" },
    });

    info(`\nScrapeLog entries (TOPIC) since baseline: ${topicLogs.length}`);
    if (topicLogs.length > 0) {
        for (const l of topicLogs) {
            info(`  raw: ${l.rawCollected}, qualified: ${l.qualified}, failedEng: ${l.failedEngagement}, unknownFollowers: ${l.unknownFollowers}`);
        }
    }

    // Author discovery: check for new ACCOUNT sources created since baseline
    const newSources = await prisma.scraperSource.findMany({
        where: {
            workspaceId: ws.id,
            type: "ACCOUNT",
            createdAt: { gte: since },
        },
    });

    if (newSources.length > 0) {
        pass(`Author discovery: ${newSources.length} new ACCOUNT sources auto-created`);
        for (const s of newSources.slice(0, 5)) {
            info(`  + @${s.value} (created: ${s.createdAt.toISOString()})`);
        }
        testsPassed++;
    } else {
        info("No new ACCOUNT sources auto-created (discovery didn't trigger or no qualifying authors)");
    }

    // AccountCache entries
    const recentCacheEntries = await prisma.accountCache.findMany({
        where: { updatedAt: { gte: since } },
        orderBy: { updatedAt: "desc" },
        take: 10,
    });

    if (recentCacheEntries.length > 0) {
        pass(`AccountCache: ${recentCacheEntries.length} entries updated since baseline`);
        for (const c of recentCacheEntries.slice(0, 5)) {
            info(`  @${c.platformId} | followers: ${c.followerCount}`);
        }
        testsPassed++;
    } else {
        info("No AccountCache updates (may not have needed to resolve new followers)");
    }

    // ─── TEST 3: MEDIA ENRICHMENT & VIDEO EXTRACTION ──────────────────────

    header("TEST 3: MEDIA ENRICHMENT & VIDEO EXTRACTION");

    // Check all recent posts for media
    const allNewPosts = await prisma.post.findMany({
        where: {
            workspaceId: ws.id,
            createdAt: { gte: since },
        },
    });

    const postsWithMedia = allNewPosts.filter(p => {
        const media = p.mediaUrls as any[];
        return media && Array.isArray(media) && media.length > 0;
    });

    info(`Posts with media: ${postsWithMedia.length}/${allNewPosts.length}`);

    // Check for Azure Blob URLs
    const postsWithBlobUrls = postsWithMedia.filter(p => {
        const media = p.mediaUrls as any[];
        return media.some((m: any) => m.url?.includes(BLOB_HOST));
    });

    if (postsWithBlobUrls.length > 0) {
        pass(`${postsWithBlobUrls.length} posts have media uploaded to Azure Blob Storage`);
        testsPassed++;

        // Check specifically for scraped/ prefix
        const scrapedUploads = postsWithBlobUrls.filter(p => {
            const media = p.mediaUrls as any[];
            return media.some((m: any) => m.url?.includes(`${BLOB_HOST}/media/scraped/`));
        });
        if (scrapedUploads.length > 0) {
            pass(`${scrapedUploads.length} posts have media in /media/scraped/ path`);
            testsPassed++;
        }

        // Sample URLs
        info("\nSample media URLs:");
        for (const p of postsWithBlobUrls.slice(0, 3)) {
            const media = p.mediaUrls as any[];
            for (const m of media) {
                info(`  [${m.type}] ${m.url?.substring(0, 100)}...`);
            }
        }
    } else if (postsWithMedia.length > 0) {
        warn("Media found but none uploaded to Azure Blob — storage upload may be failing");
        testsWarning++;

        info("\nSample non-blob media URLs:");
        for (const p of postsWithMedia.slice(0, 3)) {
            const media = p.mediaUrls as any[];
            for (const m of media.slice(0, 2)) {
                info(`  [${m.type}] ${m.url?.substring(0, 100)}...`);
            }
        }
    } else {
        info("No posts with media in this scrape batch");
    }

    // Check for video posts specifically
    const postsWithVideo = postsWithMedia.filter(p => {
        const media = p.mediaUrls as any[];
        return media.some((m: any) => m.type === "video");
    });

    if (postsWithVideo.length > 0) {
        pass(`${postsWithVideo.length} posts contain video media`);
        testsPassed++;

        // Check if video URLs are HQ (enriched) — they should point to blob or have been enriched
        const enrichedVideos = postsWithVideo.filter(p => {
            const media = p.mediaUrls as any[];
            return media.some((m: any) => m.type === "video" && m.url?.includes(BLOB_HOST));
        });
        if (enrichedVideos.length > 0) {
            pass(`${enrichedVideos.length} video posts have enriched HQ URLs uploaded to blob`);
            testsPassed++;
        } else {
            info("Video posts exist but HQ URLs not uploaded to blob (enrichment may have failed or been skipped)");
        }
    } else {
        info("No video posts in this scrape batch (may just be no videos in recent content)");
    }

    // ─── TEST 4: BOT DETECTION & IP HEALTH ────────────────────────────────

    header("TEST 4: BOT DETECTION & IP HEALTH (DB indicators)");

    const allLogs = await prisma.scrapeLog.findMany({
        where: { createdAt: { gte: since } },
        orderBy: { createdAt: "desc" },
    });

    info(`Total scrape logs since baseline: ${allLogs.length}`);

    const zeroCollectLogs = allLogs.filter(l => l.rawCollected === 0);
    const successfulLogs = allLogs.filter(l => l.rawCollected > 0);
    const qualifiedLogs = allLogs.filter(l => l.qualified > 0);

    if (allLogs.length > 0) {
        const successRate = ((successfulLogs.length / allLogs.length) * 100).toFixed(1);
        info(`Success rate (rawCollected > 0): ${successfulLogs.length}/${allLogs.length} (${successRate}%)`);

        if (parseFloat(successRate) >= 80) {
            pass(`Scrape success rate is ${successRate}% — Singapore IP is healthy`);
            testsPassed++;
        } else if (parseFloat(successRate) >= 50) {
            warn(`Scrape success rate is ${successRate}% — some issues but mostly working`);
            testsWarning++;
        } else {
            fail(`Scrape success rate is ${successRate}% — possible IP block or bot detection`);
            testsFailed++;
        }

        if (zeroCollectLogs.length > 0) {
            warn(`${zeroCollectLogs.length} scrapes with rawCollected=0:`);
            for (const z of zeroCollectLogs.slice(0, 5)) {
                const sourceInfo = activeSources.find(s => s.id === z.sourceId);
                warn(`  ${z.createdAt.toISOString()} | ${sourceInfo?.type || z.sourceType}:${sourceInfo?.value || z.sourceId}`);
            }
        }
    } else {
        warn("No scrape logs since baseline — scrape may not have run yet");
        testsWarning++;
    }

    // Check PipelineRun for recent SCRAPE runs
    const recentRuns = await prisma.pipelineRun.findMany({
        where: {
            workspaceId: ws.id,
            step: "SCRAPE",
            startedAt: { gte: since },
        },
        orderBy: { startedAt: "desc" },
        take: 5,
    });

    if (recentRuns.length > 0) {
        info(`\nPipelineRun (SCRAPE) since baseline: ${recentRuns.length}`);
        for (const run of recentRuns) {
            info(`  ${run.startedAt.toISOString()} | status: ${run.status} | error: ${run.error || 'none'}`);
        }
    }

    // ─── FINAL SUMMARY ────────────────────────────────────────────────────

    header("FINAL SUMMARY");

    console.log(`  Tests Passed:  ${testsPassed}`);
    console.log(`  Tests Failed:  ${testsFailed}`);
    console.log(`  Warnings:      ${testsWarning}`);
    console.log();

    if (testsFailed === 0) {
        console.log("  OVERALL: PASS — Scrape pipeline is operational");
    } else if (testsFailed <= 2) {
        console.log("  OVERALL: PARTIAL — Some issues detected, review failures above");
    } else {
        console.log("  OVERALL: FAIL — Critical pipeline issues detected");
    }

    console.log();
    info("For full bot detection analysis, also check Azure logs:");
    info("  az containerapp logs show --name worker-scraper-sg --resource-group john-threads --follow");
    info("  Look for: 403, Forbidden, login redirect, Navigation timeout, net::ERR_");
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    const command = process.argv[2];

    if (!command || !["baseline", "verify"].includes(command)) {
        console.log("Usage:");
        console.log("  npx tsx scripts/ops_test_sg.ts baseline              — Capture pre-scrape state");
        console.log("  npx tsx scripts/ops_test_sg.ts verify [timestamp]    — Verify post-scrape results");
        console.log();
        console.log("Full workflow:");
        console.log("  1. npx tsx scripts/ops_test_sg.ts baseline");
        console.log("  2. npx tsx scripts/manual_scrape.ts HKParties");
        console.log("  3. Wait for scrape to complete (watch Azure logs)");
        console.log("  4. npx tsx scripts/ops_test_sg.ts verify <timestamp_from_step_1>");
        process.exit(1);
    }

    try {
        if (command === "baseline") {
            await baseline();
        } else if (command === "verify") {
            const timestamp = process.argv[3];
            await verify(timestamp);
        }
    } catch (error: any) {
        console.error("\nFatal error:", error.message);
        if (error.message.includes("Can't reach database")) {
            console.log("\n[Tip] Make sure DATABASE_URL points to the production database.");
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
