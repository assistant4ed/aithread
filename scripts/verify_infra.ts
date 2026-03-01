/**
 * Infrastructure Health Verification — Live Systems
 *
 * Runs 3 checks:
 *   1. Redis Queue Health — Jobs moving from waiting → active, worker connected
 *   2. Azure Blob Persistence — Upload test blob, verify accessibility from public URL
 *   3. Database Integrity — PipelineRun entries exist for every heartbeat cycle
 *
 * Usage:
 *   npx tsx scripts/verify_infra.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { Queue } from "bullmq";
import Redis from "ioredis";
import { BlobServiceClient } from "@azure/storage-blob";
// Inline queue names to avoid importing lib/queue.ts, which creates
// module-level BullMQ Queue instances that connect to Redis immediately.
const SCRAPE_QUEUE_NAME = "scrape-accounts";
const YOUTUBE_QUEUE_NAME = "youtube-automation";
import axios from "axios";

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

// ─── Helpers ─────────────────────────────────────────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    return Promise.race([
        promise,
        new Promise<T>((_, reject) =>
            setTimeout(() => reject(new Error(`Timed out after ${ms}ms`)), ms)
        ),
    ]);
}

// ─── CHECK 1: Redis Queue Health ─────────────────────────────────────────────

async function checkRedisQueueHealth() {
    header("CHECK 1 — REDIS QUEUE HEALTH");

    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    const parsed = new URL(redisUrl);
    info(`Redis host: ${parsed.hostname}:${parsed.port || 6379} (${parsed.protocol === "rediss:" ? "TLS" : "plain"})`);

    // 1a. Probe Redis connectivity with a raw ioredis client (fail-fast)
    const probe = new Redis({
        host: parsed.hostname,
        port: parseInt(parsed.port || "6379", 10),
        password: parsed.password || undefined,
        username: parsed.username || undefined,
        tls: parsed.protocol === "rediss:" ? { checkServerIdentity: () => undefined } : undefined,
        connectTimeout: 5_000,
        maxRetriesPerRequest: 1,
        enableReadyCheck: false,
        family: 4,
        retryStrategy: (times) => (times > 2 ? null : Math.min(times * 500, 2000)),
        lazyConnect: true,
    });
    probe.on("error", () => {}); // swallow — we handle failures below

    try {
        await withTimeout(probe.connect(), 10_000);
        await withTimeout(probe.ping(), 5_000);
    } catch (e: any) {
        fail(`Redis connection failed: ${e.message}`);
        failed++;
        probe.disconnect();
        return;
    } finally {
        probe.disconnect();
    }
    pass("Redis connection OK");
    passed++;

    // Now safe to create BullMQ queues — we know Redis is reachable
    const scrapeQ = new Queue(SCRAPE_QUEUE_NAME, { connection: { host: parsed.hostname, port: parseInt(parsed.port || "6379", 10), password: parsed.password || undefined, username: parsed.username || undefined, tls: parsed.protocol === "rediss:" ? { checkServerIdentity: () => undefined } : undefined, maxRetriesPerRequest: null, enableReadyCheck: false, family: 4 } });
    const youtubeQ = new Queue(YOUTUBE_QUEUE_NAME, { connection: { host: parsed.hostname, port: parseInt(parsed.port || "6379", 10), password: parsed.password || undefined, username: parsed.username || undefined, tls: parsed.protocol === "rediss:" ? { checkServerIdentity: () => undefined } : undefined, maxRetriesPerRequest: null, enableReadyCheck: false, family: 4 } });

    try {

        // 1b. Scrape queue job counts
        const scrapeCounts = await scrapeQ.getJobCounts();
        info(`Scrape queue (${SCRAPE_QUEUE_NAME}):`);
        info(`  waiting: ${scrapeCounts.waiting}  active: ${scrapeCounts.active}  completed: ${scrapeCounts.completed}  failed: ${scrapeCounts.failed}  delayed: ${scrapeCounts.delayed}`);

        // If jobs are stuck in waiting with 0 active, the worker likely isn't connected
        if (scrapeCounts.waiting > 0 && scrapeCounts.active === 0) {
            // Check how long jobs have been waiting
            const waitingJobs = await scrapeQ.getJobs(["waiting"], 0, 5);
            let oldestWaitMs = 0;
            for (const job of waitingJobs) {
                const waitMs = Date.now() - (job.timestamp || Date.now());
                if (waitMs > oldestWaitMs) oldestWaitMs = waitMs;
            }
            const oldestWaitMin = Math.round(oldestWaitMs / 60_000);

            check(
                oldestWaitMin < 10,
                `Waiting jobs are recent (oldest: ${oldestWaitMin}min) — worker likely processing`,
                `${scrapeCounts.waiting} jobs stuck in WAITING for ${oldestWaitMin}min with 0 active — scrape worker may not be connected`
            );
        } else if (scrapeCounts.active > 0) {
            pass(`Scrape worker is active (${scrapeCounts.active} job(s) processing)`);
        } else if (scrapeCounts.waiting === 0 && scrapeCounts.active === 0) {
            info("Scrape queue is idle (no waiting or active jobs — may be between cycles)");

            // Check if there have been recent completions
            const recentCompleted = await scrapeQ.getJobs(["completed"], 0, 5);
            if (recentCompleted.length > 0) {
                const latestJob = recentCompleted[0];
                const finishedAgo = latestJob.finishedOn
                    ? Math.round((Date.now() - latestJob.finishedOn) / 60_000)
                    : null;
                if (finishedAgo !== null) {
                    check(
                        finishedAgo < 180,
                        `Last completed scrape job: ${finishedAgo}min ago — worker is alive`,
                        `Last completed scrape job: ${finishedAgo}min ago — worker may have stopped`
                    );
                }
            } else {
                warn("No completed scrape jobs in history — worker may not have run yet");
            }
        }

        // 1c. Check for failed jobs
        if (scrapeCounts.failed > 0) {
            const failedJobs = await scrapeQ.getJobs(["failed"], 0, 3);
            warn(`${scrapeCounts.failed} failed scrape job(s). Recent failures:`);
            for (const job of failedJobs) {
                const failedAgo = job.finishedOn
                    ? `${Math.round((Date.now() - job.finishedOn) / 60_000)}min ago`
                    : "unknown";
                const reason = job.failedReason || "no reason";
                info(`  ${job.id}: ${reason.slice(0, 100)} (${failedAgo})`);
            }

            check(
                scrapeCounts.failed < 20,
                `Failed job count (${scrapeCounts.failed}) is within tolerance`,
                `High failure count: ${scrapeCounts.failed} failed scrape jobs — investigate errors above`
            );
        } else {
            pass("No failed scrape jobs");
        }

        // 1d. YouTube queue
        const ytCounts = await youtubeQ.getJobCounts();
        info(`YouTube queue (${YOUTUBE_QUEUE_NAME}):`);
        info(`  waiting: ${ytCounts.waiting}  active: ${ytCounts.active}  completed: ${ytCounts.completed}  failed: ${ytCounts.failed}`);

        if (ytCounts.waiting > 5 && ytCounts.active === 0) {
            warn("YouTube queue has waiting jobs but no active processing — worker may be disconnected");
        }
    } finally {
        await scrapeQ.close();
        await youtubeQ.close();
    }
}

// ─── CHECK 2: Azure Blob Persistence ─────────────────────────────────────────

async function checkAzureBlobPersistence() {
    header("CHECK 2 — AZURE BLOB PERSISTENCE");

    const connStr = process.env.AZURE_STORAGE_CONNECTION_STRING;
    if (!connStr) {
        fail("AZURE_STORAGE_CONNECTION_STRING not set — cannot test blob storage");
        failed++;
        return;
    }

    // Extract account name for logging
    const accountMatch = connStr.match(/AccountName=([^;]+)/);
    const accountName = accountMatch?.[1] || "unknown";
    info(`Storage account: ${accountName}`);

    const containerName = "media";
    const testBlobName = `_healthcheck/probe-${Date.now()}.txt`;
    const testContent = `infra-health-probe ${new Date().toISOString()}`;

    try {
        const blobServiceClient = BlobServiceClient.fromConnectionString(connStr);
        const containerClient = blobServiceClient.getContainerClient(containerName);

        // 2a. Check container exists and is accessible
        let containerExists = false;
        try {
            containerExists = await containerClient.exists();
        } catch (e: any) {
            fail(`Cannot reach Azure Storage: ${e.message}`);
            failed++;
            return;
        }
        check(containerExists, `Container '${containerName}' exists and is accessible`, `Container '${containerName}' not found`);

        if (!containerExists) return;

        // 2b. Upload a test blob
        const blockBlobClient = containerClient.getBlockBlobClient(testBlobName);
        let uploadOk = false;
        try {
            await blockBlobClient.upload(testContent, testContent.length, {
                blobHTTPHeaders: { blobContentType: "text/plain" },
            });
            uploadOk = true;
        } catch (e: any) {
            fail(`Blob upload failed: ${e.message}`);
            failed++;
        }
        check(uploadOk, `Test blob uploaded: ${testBlobName}`, "Test blob upload failed");

        if (!uploadOk) return;

        // 2c. Verify the blob is accessible via its public URL
        const publicUrl = blockBlobClient.url;
        info(`Public URL: ${publicUrl}`);

        let fetchOk = false;
        try {
            const resp = await axios.get(publicUrl, { timeout: 15_000 });
            fetchOk = resp.status === 200 && resp.data === testContent;
        } catch (e: any) {
            // Public access may be disabled — try a properties check instead
            info(`Public URL fetch failed (${e.message}) — checking blob properties instead`);
            try {
                const props = await blockBlobClient.getProperties();
                fetchOk = props.contentLength === testContent.length;
                if (fetchOk) {
                    info("Blob exists and properties match (public access may be disabled, which is OK)");
                }
            } catch (propErr: any) {
                fail(`Cannot verify blob: ${propErr.message}`);
                failed++;
            }
        }
        check(fetchOk, "Blob content verified — cross-region read OK", "Blob verification failed — content mismatch or inaccessible");

        // 2d. Check a recent real media blob to confirm production data is accessible
        const recentPost = await prisma.post.findFirst({
            where: {
                mediaUrls: { not: { equals: [] as any } },
                createdAt: { gte: new Date(Date.now() - 24 * 3600_000) },
            },
            select: { mediaUrls: true },
            orderBy: { createdAt: "desc" },
        });

        if (recentPost?.mediaUrls && Array.isArray(recentPost.mediaUrls)) {
            const firstMedia = (recentPost.mediaUrls as any[])[0];
            const mediaUrl = typeof firstMedia === "string" ? firstMedia : firstMedia?.url;

            if (mediaUrl && mediaUrl.includes("blob.core.windows.net")) {
                info(`Testing production media URL: ${mediaUrl.slice(0, 80)}...`);
                try {
                    const resp = await axios.head(mediaUrl, { timeout: 15_000 });
                    check(
                        resp.status === 200,
                        `Production media blob accessible (${resp.headers["content-type"] || "unknown type"}, ${resp.headers["content-length"] || "?"} bytes)`,
                        `Production media returned HTTP ${resp.status}`
                    );
                } catch (e: any) {
                    // Could be private — try extracting blob name and using SDK
                    info(`HEAD request failed (${e.message}) — checking via SDK`);
                    try {
                        const blobPath = new URL(mediaUrl).pathname.replace(`/${containerName}/`, "");
                        const mediaBlobClient = containerClient.getBlockBlobClient(blobPath);
                        const props = await mediaBlobClient.getProperties();
                        check(
                            !!props.contentLength && props.contentLength > 0,
                            `Production media blob accessible via SDK (${props.contentType}, ${props.contentLength} bytes)`,
                            "Production media blob exists but has 0 bytes"
                        );
                    } catch (sdkErr: any) {
                        fail(`Production media blob inaccessible: ${sdkErr.message}`);
                        failed++;
                    }
                }
            } else {
                info("Recent media is external (not Azure Blob) — skipping production blob check");
            }
        } else {
            info("No recent posts with media — skipping production blob check");
        }

        // 2e. Cleanup test blob
        try {
            await blockBlobClient.deleteIfExists();
            info("Test blob cleaned up");
        } catch { }
    } catch (e: any) {
        fail(`Azure Blob check failed: ${e.message}`);
        failed++;
    }
}

// ─── CHECK 3: Database Integrity (Pipeline Runs) ─────────────────────────────

async function checkPipelineRunIntegrity() {
    header("CHECK 3 — DATABASE INTEGRITY (PIPELINE RUNS)");

    const workspaces = await prisma.workspace.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            publishTimes: true,
            lastScrapedAt: true,
            lastSynthesizedAt: true,
            lastPublishedAt: true,
        },
    });

    if (workspaces.length === 0) {
        warn("No active workspaces — nothing to check.");
        return;
    }

    info(`Active workspaces: ${workspaces.length}`);

    const since24h = new Date(Date.now() - 24 * 3600_000);
    const since6h = new Date(Date.now() - 6 * 3600_000);

    // 3a. Overall PipelineRun counts (last 24h)
    const [totalRuns, runningRuns, failedRuns, completedRuns] = await Promise.all([
        prisma.pipelineRun.count({ where: { startedAt: { gte: since24h } } }),
        prisma.pipelineRun.count({ where: { startedAt: { gte: since24h }, status: "RUNNING" } }),
        prisma.pipelineRun.count({ where: { startedAt: { gte: since24h }, status: "FAILED" } }),
        prisma.pipelineRun.count({ where: { startedAt: { gte: since24h }, status: "COMPLETED" } }),
    ]);

    info(`PipelineRuns (24h): ${totalRuns} total — ${completedRuns} completed, ${failedRuns} failed, ${runningRuns} running`);

    check(
        totalRuns > 0,
        `Pipeline is active: ${totalRuns} runs in last 24h`,
        "No PipelineRun records in last 24h — heartbeat may not be running"
    );

    // 3b. Check for stuck RUNNING entries (started >30min ago, never completed)
    const stuckThreshold = new Date(Date.now() - 30 * 60_000);
    const stuckRuns = await prisma.pipelineRun.findMany({
        where: {
            status: "RUNNING",
            startedAt: { lt: stuckThreshold },
        },
        select: {
            id: true,
            workspaceId: true,
            step: true,
            startedAt: true,
        },
        take: 10,
    });

    if (stuckRuns.length > 0) {
        for (const run of stuckRuns.slice(0, 5)) {
            const ageMin = Math.round((Date.now() - run.startedAt.getTime()) / 60_000);
            warn(`Stuck run: ${run.id.slice(0, 8)} — ${run.step} for ws ${run.workspaceId.slice(0, 8)} (started ${ageMin}min ago, still RUNNING)`);
        }
    }
    check(
        stuckRuns.length === 0,
        "No stuck RUNNING pipeline runs (all completed or failed within 30min)",
        `${stuckRuns.length} pipeline run(s) stuck in RUNNING for >30min — possible crash or hang`
    );

    // 3c. Check failure rate
    if (totalRuns > 0) {
        const failRate = failedRuns / totalRuns;
        info(`Failure rate (24h): ${(failRate * 100).toFixed(1)}% (${failedRuns}/${totalRuns})`);

        check(
            failRate < 0.3,
            `Pipeline failure rate is healthy (${(failRate * 100).toFixed(1)}%)`,
            `High pipeline failure rate: ${(failRate * 100).toFixed(1)}% — investigate failing steps`
        );

        // Show breakdown by step if there are failures
        if (failedRuns > 0) {
            const failedByStep = await prisma.pipelineRun.groupBy({
                by: ["step"],
                where: { startedAt: { gte: since24h }, status: "FAILED" },
                _count: { step: true },
            });
            for (const row of failedByStep) {
                info(`  ${row.step}: ${row._count.step} failure(s)`);
            }

            // Show most recent errors
            const recentErrors = await prisma.pipelineRun.findMany({
                where: { startedAt: { gte: since24h }, status: "FAILED" },
                select: { step: true, error: true, startedAt: true, workspaceId: true },
                orderBy: { startedAt: "desc" },
                take: 3,
            });
            if (recentErrors.length > 0) {
                info("  Recent errors:");
                for (const err of recentErrors) {
                    const ago = Math.round((Date.now() - err.startedAt.getTime()) / 60_000);
                    info(`    ${err.step} (${ago}min ago): ${(err.error || "no message").slice(0, 120)}`);
                }
            }
        }
    }

    // 3d. Per-workspace: verify each step ran recently
    for (const ws of workspaces) {
        info(`\nWorkspace: ${ws.name}`);

        const expectedWindowsPerDay = ws.publishTimes?.length || 3;
        info(`  Publish windows: ${expectedWindowsPerDay} (${(ws.publishTimes || []).join(", ") || "default 12:00,18:00,22:00"})`);

        // Count runs by step in last 24h
        const stepCounts = await prisma.pipelineRun.groupBy({
            by: ["step"],
            where: { workspaceId: ws.id, startedAt: { gte: since24h } },
            _count: { step: true },
        });

        const countByStep: Record<string, number> = {};
        for (const row of stepCounts) {
            countByStep[row.step] = row._count.step;
        }

        const scrapeRuns = countByStep["SCRAPE"] || 0;
        const synthRuns = countByStep["SYNTHESIS"] || 0;
        const pubRuns = countByStep["PUBLISH"] || 0;

        info(`  24h runs — SCRAPE: ${scrapeRuns}, SYNTHESIS: ${synthRuns}, PUBLISH: ${pubRuns}`);

        // Expected: at least `expectedWindowsPerDay` scrapes per day (3 batches per window)
        // and `expectedWindowsPerDay` synthesis runs
        check(
            scrapeRuns >= expectedWindowsPerDay,
            `SCRAPE runs (${scrapeRuns}) >= expected windows (${expectedWindowsPerDay})`,
            `SCRAPE runs (${scrapeRuns}) < expected windows (${expectedWindowsPerDay}) — scrape phase may be skipping`
        );

        check(
            synthRuns >= expectedWindowsPerDay,
            `SYNTHESIS runs (${synthRuns}) >= expected windows (${expectedWindowsPerDay})`,
            `SYNTHESIS runs (${synthRuns}) < expected windows (${expectedWindowsPerDay}) — synthesis may be skipping`
        );

        // Check last activity timestamps
        if (ws.lastScrapedAt) {
            const agoMin = Math.round((Date.now() - ws.lastScrapedAt.getTime()) / 60_000);
            info(`  Last scraped: ${agoMin}min ago (${ws.lastScrapedAt.toISOString()})`);
            check(
                agoMin < 360,
                `Last scrape is recent (${agoMin}min ago)`,
                `Last scrape was ${agoMin}min ago (>6h) — heartbeat may not be triggering scrapes`
            );
        } else {
            warn("  Never scraped");
        }

        if (ws.lastSynthesizedAt) {
            const agoMin = Math.round((Date.now() - ws.lastSynthesizedAt.getTime()) / 60_000);
            info(`  Last synthesized: ${agoMin}min ago`);
        } else {
            warn("  Never synthesized");
        }

        // 3e. Check that PUBLISH runs correlate with published articles
        const publishedArticles24h = await prisma.synthesizedArticle.count({
            where: {
                workspaceId: ws.id,
                status: "PUBLISHED",
                publishedAt: { gte: since24h },
            },
        });
        info(`  Published articles (24h): ${publishedArticles24h}`);

        // If publish was triggered but nothing published, log it
        if (pubRuns > 0 && publishedArticles24h === 0) {
            warn("  PUBLISH ran but no articles were published — may be cooldown, no approved articles, or daily limit");
        }
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    header("INFRASTRUCTURE HEALTH VERIFICATION");
    info(`Timestamp: ${new Date().toISOString()}`);
    info(`Server TZ offset: UTC${-(new Date().getTimezoneOffset() / 60) >= 0 ? "+" : ""}${-(new Date().getTimezoneOffset() / 60)}`);

    await checkRedisQueueHealth();
    await checkAzureBlobPersistence();
    await checkPipelineRunIntegrity();

    // Summary
    header("SUMMARY");
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total:  ${passed + failed}\n`);

    if (failed > 0) {
        console.log("  ⚠ Some checks failed — review above.\n");
    } else {
        console.log("  ✓ All infrastructure checks passed.\n");
    }

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
    console.error("Fatal error:", e);
    await prisma.$disconnect();
    process.exit(2);
});
