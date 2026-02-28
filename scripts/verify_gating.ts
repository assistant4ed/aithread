/**
 * Gating Logic Verification — Live DB
 *
 * Runs 6 checks against the production DB to validate that the filtering/gating
 * pipeline is working correctly in practice.
 *
 * Usage:
 *   npx tsx scripts/verify_gating.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// ─── Formatting ──────────────────────────────────────────────────────────────

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

let passed = 0;
let failed = 0;

function check(condition: boolean, passMsg: string, failMsg: string) {
    if (condition) {
        pass(passMsg);
        passed++;
    } else {
        fail(failMsg);
        failed++;
    }
}

// ─── Checks ──────────────────────────────────────────────────────────────────

async function main() {
    header("GATING LOGIC VERIFICATION — LIVE DB");

    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
        fail("No workspace found in DB. Aborting.");
        return;
    }
    info(`Workspace: ${workspace.name} (${workspace.id})`);

    // ── 1. Hot Score Distribution ────────────────────────────────────────────

    header("CHECK 1: Hot Score Distribution");

    const recentPosts = await prisma.post.findMany({
        where: {
            workspaceId: workspace.id,
            createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
        },
        select: { hotScore: true, sourceType: true },
        orderBy: { hotScore: 'desc' },
    });

    info(`Recent posts (last 48h): ${recentPosts.length}`);

    if (recentPosts.length > 0) {
        const scores = recentPosts.map(p => p.hotScore);
        const minScore = Math.min(...scores);
        const maxScore = Math.max(...scores);
        const avgScore = scores.reduce((a, b) => a + b, 0) / scores.length;

        info(`Score range: ${minScore.toFixed(1)} — ${maxScore.toFixed(1)} (avg: ${avgScore.toFixed(1)})`);
        check(
            scores.every(s => s > 0),
            "All saved posts have hotScore > 0",
            `${scores.filter(s => s <= 0).length} posts have hotScore ≤ 0`
        );
    } else {
        warn("No recent posts found — gate check skipped (no data)");
    }

    // ── 2. Freshness Check ───────────────────────────────────────────────────

    header("CHECK 2: Freshness Compliance");

    // Find workspace settings for maxPostAgeHours
    const settings = workspace as any;
    const maxPostAgeHours = settings.maxPostAgeHours || 48;
    info(`maxPostAgeHours setting: ${maxPostAgeHours}h`);

    const staleAccountPosts = await prisma.post.count({
        where: {
            workspaceId: workspace.id,
            sourceType: 'ACCOUNT',
            postedAt: { lt: new Date(Date.now() - maxPostAgeHours * 3600_000) },
            createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
        },
    });

    check(
        staleAccountPosts === 0,
        `No ACCOUNT posts older than ${maxPostAgeHours}h found in recent ingestion`,
        `${staleAccountPosts} stale ACCOUNT posts found (older than ${maxPostAgeHours}h)`
    );

    const staleTopicPosts = await prisma.post.count({
        where: {
            workspaceId: workspace.id,
            sourceType: 'TOPIC',
            postedAt: { lt: new Date(Date.now() - 72 * 3600_000) },
            createdAt: { gte: new Date(Date.now() - 48 * 3600_000) },
        },
    });

    check(
        staleTopicPosts === 0,
        "No TOPIC posts older than 72h found in recent ingestion",
        `${staleTopicPosts} stale TOPIC posts found (older than 72h)`
    );

    // ── 3. Follower Cache Health ─────────────────────────────────────────────

    header("CHECK 3: Follower Cache Health");

    const ttlHours = 24;

    // Check AccountCache table if it exists
    try {
        const freshCacheEntries = await (prisma as any).accountCache.count({
            where: {
                updatedAt: { gte: new Date(Date.now() - ttlHours * 3600_000) },
            },
        });

        const totalCacheEntries = await (prisma as any).accountCache.count();

        info(`AccountCache entries: ${totalCacheEntries} total, ${freshCacheEntries} within ${ttlHours}h TTL`);
        check(
            freshCacheEntries > 0 || totalCacheEntries === 0,
            `${freshCacheEntries} cache entries are fresh (within ${ttlHours}h)`,
            "No fresh cache entries — follower resolution may be stale"
        );
    } catch {
        // Fallback: check TrackedAccount table
        const trackedAccounts = await prisma.trackedAccount.count();
        const freshAccounts = await prisma.trackedAccount.count({
            where: { lastFetchedAt: { gte: new Date(Date.now() - ttlHours * 3600_000) } },
        });

        info(`TrackedAccount entries: ${trackedAccounts} total, ${freshAccounts} within ${ttlHours}h`);
        check(
            freshAccounts > 0 || trackedAccounts === 0,
            `${freshAccounts} tracked accounts have fresh follower data`,
            "No fresh tracked accounts — follower counts may be stale"
        );
    }

    // ── 4. ScrapeLog Sanity ──────────────────────────────────────────────────

    header("CHECK 4: ScrapeLog Sanity");

    const recentLogs = await prisma.scrapeLog.findMany({
        where: { createdAt: { gte: new Date(Date.now() - 24 * 3600_000) } },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });

    info(`Recent scrape logs (last 24h): ${recentLogs.length}`);

    if (recentLogs.length > 0) {
        let allSane = true;
        for (const log of recentLogs) {
            const { rawCollected, failedEngagement, failedFreshness, qualified } = log;
            const accountedFor = (failedEngagement || 0) + (failedFreshness || 0) + (qualified || 0);

            if (rawCollected < qualified) {
                fail(`Log ${log.id}: rawCollected (${rawCollected}) < qualified (${qualified})`);
                allSane = false;
            }
            // Note: accountedFor can be < rawCollected because some posts are skipped (empty)
            // or are duplicates (updated, not counted in any bucket)
        }

        check(
            allSane,
            "All scrape logs have rawCollected >= qualified",
            "Some scrape logs have inconsistent counters (see above)"
        );

        // Show a sample log
        const sample = recentLogs[0];
        info(`Latest log: raw=${sample.rawCollected}, qualified=${sample.qualified}, failedEng=${sample.failedEngagement}, failedFresh=${sample.failedFreshness}`);
    } else {
        warn("No recent scrape logs found — sanity check skipped");
    }

    // ── 5. Score Gate Effectiveness ──────────────────────────────────────────

    header("CHECK 5: Score Gate Effectiveness");

    const logsWithRejections = recentLogs.filter(l => (l.failedEngagement || 0) > 0);
    check(
        logsWithRejections.length > 0 || recentLogs.length === 0,
        `${logsWithRejections.length}/${recentLogs.length} logs have failedEngagement > 0 — gate is rejecting low-quality posts`,
        "No logs with failedEngagement > 0 — scoring gate may not be active"
    );

    // ── 6. Topic Tier Distribution ───────────────────────────────────────────

    header("CHECK 6: Topic Tier Distribution");

    const topicPosts = await prisma.post.findMany({
        where: {
            workspaceId: workspace.id,
            sourceType: 'TOPIC',
            createdAt: { gte: new Date(Date.now() - 72 * 3600_000) },
        },
        select: { hotScore: true, sourceAccount: true },
    });

    info(`Topic posts (last 72h): ${topicPosts.length}`);

    if (topicPosts.length > 0) {
        const uniqueAuthors = new Set(topicPosts.map(p => p.sourceAccount));
        info(`Unique topic authors: ${uniqueAuthors.size}`);

        const scores = topicPosts.map(p => p.hotScore).sort((a, b) => a - b);
        const median = scores[Math.floor(scores.length / 2)];
        info(`Topic score median: ${median.toFixed(1)}, min: ${scores[0].toFixed(1)}, max: ${scores[scores.length - 1].toFixed(1)}`);

        check(
            topicPosts.length > 0,
            "Topic posts exist — topic scraping pipeline is active",
            "No topic posts found"
        );
    } else {
        warn("No topic posts found — topic tier distribution check skipped");
    }

    // ── Summary ──────────────────────────────────────────────────────────────

    header("SUMMARY");
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total:  ${passed + failed}`);

    if (failed > 0) {
        console.log("\n  ⚠ Some checks failed — review output above.");
        process.exit(1);
    } else {
        console.log("\n  All checks passed.");
    }
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
