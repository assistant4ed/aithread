/**
 * Publishing & Scheduling Pipeline Verification — Live DB
 *
 * Runs 5 checks:
 *   1. Token Health — Threads/Instagram/Twitter token validity & expiry
 *   2. Scheduling Accuracy — timezone drift detection (HKT vs server TZ)
 *   3. Auto-Approval Status — workspace config & recent approval stats
 *   4. Publish Distribution — detect "all at once" or "only once at end of day" patterns
 *   5. Stagger Coverage — verify articles are distributed across publish windows
 *
 * Usage:
 *   npx tsx scripts/verify_publishing.ts
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

// ─── CHECK 1: Token Health ──────────────────────────────────────────────────

async function checkTokenHealth() {
    header("CHECK 1 — TOKEN HEALTH");

    const workspaces = await prisma.workspace.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            threadsToken: true,
            threadsExpiresAt: true,
            instagramAccessToken: true,
            instagramExpiresAt: true,
            twitterApiKey: true,
            twitterExpiresAt: true,
        },
    });

    if (workspaces.length === 0) {
        warn("No active workspaces found.");
        return;
    }

    for (const ws of workspaces) {
        info(`Workspace: ${ws.name}`);
        const nowEpoch = Math.floor(Date.now() / 1000);
        const sevenDays = 7 * 86400;

        // Threads
        if (ws.threadsToken) {
            if (ws.threadsExpiresAt) {
                const daysLeft = Math.round((ws.threadsExpiresAt - nowEpoch) / 86400);
                check(
                    ws.threadsExpiresAt > nowEpoch,
                    `Threads token valid (${daysLeft} days remaining)`,
                    `Threads token EXPIRED (expired ${-daysLeft} days ago)`
                );
                if (ws.threadsExpiresAt - nowEpoch < sevenDays && ws.threadsExpiresAt > nowEpoch) {
                    warn(`Threads token expiring soon (${daysLeft} days)`);
                }
            } else {
                warn("Threads token present but no expiry date set");
            }
        } else {
            info("Threads: not configured");
        }

        // Instagram
        if (ws.instagramAccessToken) {
            if (ws.instagramExpiresAt) {
                const daysLeft = Math.round((ws.instagramExpiresAt - nowEpoch) / 86400);
                check(
                    ws.instagramExpiresAt > nowEpoch,
                    `Instagram token valid (${daysLeft} days remaining)`,
                    `Instagram token EXPIRED (expired ${-daysLeft} days ago)`
                );
            } else {
                warn("Instagram token present but no expiry date set");
            }
        } else {
            info("Instagram: not configured");
        }

        // Twitter
        if (ws.twitterApiKey) {
            info("Twitter: configured (API keys don't expire)");
        } else {
            info("Twitter: not configured");
        }
    }
}

// ─── CHECK 2: Scheduling Accuracy ──────────────────────────────────────────

async function checkSchedulingAccuracy() {
    header("CHECK 2 — SCHEDULING ACCURACY (TIMEZONE DRIFT)");

    const serverOffset = -(new Date().getTimezoneOffset() / 60);
    info(`Server timezone offset: UTC${serverOffset >= 0 ? "+" : ""}${serverOffset}`);

    const isHKT = serverOffset === 8;
    check(
        isHKT,
        "Server timezone is UTC+8 (HKT/SGT) — no drift expected",
        `Server timezone is UTC${serverOffset >= 0 ? "+" : ""}${serverOffset} — timezone drift risk for publishTimes!`
    );

    // Check recent published articles for scheduling accuracy
    const since = new Date(Date.now() - 7 * 86400_000);
    const published = await prisma.synthesizedArticle.findMany({
        where: {
            publishedAt: { gte: since },
            scheduledPublishAt: { not: null },
            status: "PUBLISHED",
        },
        select: {
            id: true,
            scheduledPublishAt: true,
            publishedAt: true,
            workspaceId: true,
        },
    });

    info(`Found ${published.length} published articles with schedules (last 7 days)`);

    if (published.length > 0) {
        let maxDriftMinutes = 0;
        let driftCount = 0;

        for (const a of published) {
            if (!a.scheduledPublishAt || !a.publishedAt) continue;
            const driftMs = a.publishedAt.getTime() - a.scheduledPublishAt.getTime();
            const driftMin = Math.abs(driftMs / 60_000);

            if (driftMin > maxDriftMinutes) maxDriftMinutes = driftMin;
            if (driftMin > 10) {
                driftCount++;
                if (driftCount <= 3) {
                    info(`Article ${a.id}: scheduled ${a.scheduledPublishAt.toISOString()}, published ${a.publishedAt.toISOString()} (drift: ${driftMin.toFixed(0)}min)`);
                }
            }
        }

        check(
            driftCount === 0,
            `All ${published.length} articles published within 10 minutes of schedule`,
            `${driftCount}/${published.length} articles had >10 min drift (max: ${maxDriftMinutes.toFixed(0)}min)`
        );
    }
}

// ─── CHECK 3: Auto-Approval Status ─────────────────────────────────────────

async function checkAutoApproval() {
    header("CHECK 3 — AUTO-APPROVAL STATUS");

    const workspaces = await prisma.workspace.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            autoApproveDrafts: true,
            autoApprovePrompt: true,
        },
    });

    for (const ws of workspaces) {
        info(`Workspace: ${ws.name}`);
        info(`  autoApproveDrafts: ${ws.autoApproveDrafts}`);
        if (ws.autoApprovePrompt) {
            info(`  autoApprovePrompt: "${ws.autoApprovePrompt.slice(0, 120)}${ws.autoApprovePrompt.length > 120 ? "..." : ""}"`);
        }

        // Check recent approval stats
        const since = new Date(Date.now() - 48 * 3600_000);
        const [approved, rejected, pendingReview] = await Promise.all([
            prisma.synthesizedArticle.count({ where: { workspaceId: ws.id, status: "APPROVED", createdAt: { gte: since } } }),
            prisma.synthesizedArticle.count({ where: { workspaceId: ws.id, status: "REJECTED", createdAt: { gte: since } } }),
            prisma.synthesizedArticle.count({ where: { workspaceId: ws.id, status: "PENDING_REVIEW", createdAt: { gte: since } } }),
        ]);

        info(`  48h stats: ${approved} approved, ${rejected} rejected, ${pendingReview} pending review`);

        if (ws.autoApproveDrafts) {
            check(
                pendingReview === 0,
                `No articles stuck in PENDING_REVIEW with auto-approve enabled`,
                `${pendingReview} articles in PENDING_REVIEW despite autoApproveDrafts=true — moderator AI may be failing`
            );

            const total = approved + rejected;
            if (total > 0) {
                const approvalRate = (approved / total * 100).toFixed(0);
                info(`  Approval rate: ${approvalRate}% (${approved}/${total})`);
                check(
                    rejected / total < 0.8,
                    `Rejection rate is within bounds (${(rejected / total * 100).toFixed(0)}%)`,
                    `High rejection rate: ${(rejected / total * 100).toFixed(0)}% — auto-approve prompt may be too strict`
                );
            }
        }
    }
}

// ─── CHECK 4: Publish Distribution ──────────────────────────────────────────

async function checkPublishDistribution() {
    header("CHECK 4 — PUBLISH DISTRIBUTION (BATCH POSTING DETECTION)");

    const since = new Date(Date.now() - 7 * 86400_000);
    const published = await prisma.synthesizedArticle.findMany({
        where: {
            publishedAt: { gte: since },
            status: "PUBLISHED",
        },
        select: {
            id: true,
            publishedAt: true,
            workspaceId: true,
        },
        orderBy: { publishedAt: "asc" },
    });

    info(`Found ${published.length} published articles (last 7 days)`);

    if (published.length < 2) {
        warn("Not enough published articles to check distribution.");
        return;
    }

    // Group by workspace
    const byWorkspace = new Map<string, Date[]>();
    for (const a of published) {
        if (!a.publishedAt) continue;
        const list = byWorkspace.get(a.workspaceId) || [];
        list.push(a.publishedAt);
        byWorkspace.set(a.workspaceId, list);
    }

    for (const [wsId, times] of byWorkspace) {
        times.sort((a, b) => a.getTime() - b.getTime());

        // Detect "posted at the same time" — articles within 5 minutes of each other
        let batchCount = 0;
        for (let i = 1; i < times.length; i++) {
            const gapMinutes = (times[i].getTime() - times[i - 1].getTime()) / 60_000;
            if (gapMinutes < 5) {
                batchCount++;
                if (batchCount <= 3) {
                    info(`Workspace ${wsId}: articles ${i - 1} & ${i} published ${gapMinutes.toFixed(1)}min apart`);
                }
            }
        }

        check(
            batchCount === 0,
            `Workspace ${wsId.slice(0, 8)}: no batch-posting detected (${times.length} articles)`,
            `Workspace ${wsId.slice(0, 8)}: ${batchCount} batch-posting instances (articles <5min apart)`
        );

        // Detect "only posting at end of day" — check hour distribution in HKT
        const hourCounts = new Map<number, number>();
        for (const t of times) {
            const hktHour = parseInt(t.toLocaleTimeString("en-GB", { hour: "2-digit", timeZone: "Asia/Hong_Kong" }));
            hourCounts.set(hktHour, (hourCounts.get(hktHour) || 0) + 1);
        }

        const distinctHours = hourCounts.size;
        info(`Workspace ${wsId.slice(0, 8)}: published across ${distinctHours} distinct hours HKT`);
        for (const [hour, count] of [...hourCounts].sort((a, b) => a[0] - b[0])) {
            info(`  ${hour.toString().padStart(2, "0")}:xx HKT — ${count} article(s)`);
        }

        // Get workspace publishTimes for comparison
        const ws = await prisma.workspace.findUnique({
            where: { id: wsId },
            select: { publishTimes: true, name: true },
        });
        if (ws && ws.publishTimes.length > 1) {
            check(
                distinctHours >= 2,
                `${ws.name}: articles distributed across ${distinctHours} time windows`,
                `${ws.name}: articles only posted at ${distinctHours} time(s) — should spread across ${ws.publishTimes.length} windows (${ws.publishTimes.join(", ")})`
            );
        }
    }
}

// ─── CHECK 5: Stagger Coverage ──────────────────────────────────────────────

async function checkStaggerCoverage() {
    header("CHECK 5 — STAGGER COVERAGE");

    const workspaces = await prisma.workspace.findMany({
        where: { isActive: true },
        select: {
            id: true,
            name: true,
            publishTimes: true,
            dailyPostLimit: true,
        },
    });

    for (const ws of workspaces) {
        info(`Workspace: ${ws.name}`);
        info(`  publishTimes: [${ws.publishTimes.join(", ")}]`);
        info(`  dailyPostLimit: ${ws.dailyPostLimit}`);

        // Check upcoming scheduled articles
        const now = new Date();
        const upcoming = await prisma.synthesizedArticle.findMany({
            where: {
                workspaceId: ws.id,
                status: { in: ["APPROVED", "PENDING_REVIEW"] },
                scheduledPublishAt: { gte: now },
            },
            select: {
                id: true,
                status: true,
                scheduledPublishAt: true,
            },
            orderBy: { scheduledPublishAt: "asc" },
        });

        info(`  Upcoming scheduled articles: ${upcoming.length}`);

        // Detect duplicate scheduledPublishAt (the "3 posts at once" issue)
        const timeGroups = new Map<string, string[]>();
        for (const a of upcoming) {
            if (!a.scheduledPublishAt) continue;
            const key = a.scheduledPublishAt.toISOString();
            const group = timeGroups.get(key) || [];
            group.push(a.id);
            timeGroups.set(key, group);
        }

        let duplicateSlots = 0;
        for (const [time, ids] of timeGroups) {
            if (ids.length > 1) {
                duplicateSlots++;
                const hktTime = new Date(time).toLocaleTimeString("en-GB", {
                    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong"
                });
                warn(`  ${ids.length} articles scheduled for same slot: ${hktTime} HKT (${ids.join(", ")})`);
            }
        }

        check(
            duplicateSlots === 0,
            `${ws.name}: no duplicate time slots — stagger is working`,
            `${ws.name}: ${duplicateSlots} duplicate time slot(s) detected — stagger not applied or bypassed`
        );

        // Show the schedule
        for (const a of upcoming.slice(0, 6)) {
            if (!a.scheduledPublishAt) continue;
            const hktTime = a.scheduledPublishAt.toLocaleTimeString("en-GB", {
                hour: "2-digit", minute: "2-digit", timeZone: "Asia/Hong_Kong"
            });
            const hktDate = a.scheduledPublishAt.toLocaleDateString("en-CA", { timeZone: "Asia/Hong_Kong" });
            info(`  ${a.id.slice(0, 8)}... → ${hktDate} ${hktTime} HKT [${a.status}]`);
        }
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    header("PUBLISHING & SCHEDULING PIPELINE VERIFICATION");

    await checkTokenHealth();
    await checkSchedulingAccuracy();
    await checkAutoApproval();
    await checkPublishDistribution();
    await checkStaggerCoverage();

    // Summary
    header("SUMMARY");
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total:  ${passed + failed}\n`);

    if (failed > 0) {
        console.log("  ⚠ Some checks failed — review above.\n");
    } else {
        console.log("  ✓ All checks passed.\n");
    }

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
    console.error("Fatal error:", e);
    await prisma.$disconnect();
    process.exit(2);
});
