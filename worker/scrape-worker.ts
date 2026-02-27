import "dotenv/config";
import { Worker, Job } from "bullmq";
import { SCRAPE_QUEUE_NAME, ScrapeJobData, redisConnection } from "../lib/queue";
import { ThreadsScraper } from "../lib/scraper";
import { processPost, resolveFollowerCounts } from "../lib/processor";
import { uploadMediaToStorage } from "../lib/storage";
import { prisma } from "../lib/prisma";

const CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY || "1", 10);

const scraperPool: Map<number, ThreadsScraper> = new Map();

async function getScraperForSlot(slotId: number): Promise<ThreadsScraper> {
    let scraper = scraperPool.get(slotId);
    if (!scraper) {
        scraper = new ThreadsScraper();
        scraperPool.set(slotId, scraper);
    }
    return scraper;
}

// Track which slot is processing (simple round-robin via job counter)
let jobCounter = 0;

// ─── Follower Count Cache ─────────────────────────────────────────────────────

const FOLLOWER_CACHE_TTL_HOURS = 6;

/**
 * Returns the cached follower count for an account, or scrapes it fresh
 * if the cache is stale (> 6 hours old) or missing.
 */
async function getOrFetchFollowerCount(username: string, scraper: ThreadsScraper): Promise<number> {
    const cached = await prisma.trackedAccount.findUnique({ where: { username } });

    if (cached) {
        const ageHours = (Date.now() - cached.lastFetchedAt.getTime()) / (1000 * 60 * 60);
        if (ageHours < FOLLOWER_CACHE_TTL_HOURS) {
            console.log(`[ScrapeWorker] @${username} follower count (cached): ${cached.followerCount}`);
            return cached.followerCount;
        }
    }

    // Cache miss or stale — scrape fresh
    const followerCount = await scraper.getFollowerCount(username);

    await prisma.trackedAccount.upsert({
        where: { username },
        update: { followerCount, lastFetchedAt: new Date() },
        create: { username, followerCount, lastFetchedAt: new Date() },
    });

    return followerCount;
}

// ─── Job Processor ───────────────────────────────────────────────────────────

async function processScrapeJob(job: Job<ScrapeJobData>) {
    const JOB_TIMEOUT_MS = 600_000; // 10 minutes

    // Create an abort controller for manual timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), JOB_TIMEOUT_MS);

    try {
        let { target, type, workspaceId, settings, skipTranslation, sourceId } = job.data;
        const slotId = jobCounter++ % CONCURRENCY;

        // Normalize target: strip leading @ or # if present
        if (type === 'ACCOUNT' && target.startsWith('@')) {
            target = target.substring(1);
        }
        if (type === 'TOPIC' && target.startsWith('#')) {
            target = target.substring(1);
        }

        console.log(`[ScrapeWorker] Processing ${type}:${target} (workspace: ${workspaceId}, slot: ${slotId}, attempt: ${job.attemptsMade + 1})`);

        const scraper = await getScraperForSlot(slotId);

        // Fetch source details if sourceId is provided
        let sourceDetails: any = null;
        if (sourceId) {
            sourceDetails = await prisma.scraperSource.findUnique({ where: { id: sourceId } });
        }

        // Rate-limit delay (stagger requests) - respecting the abort signal
        await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, 2000 + Math.random() * 3000);
            controller.signal.addEventListener('abort', () => {
                clearTimeout(t);
                reject(new Error("Job exceeded 10 minute timeout"));
            });
        });

        const maxAgeHours = settings?.maxPostAgeHours || 172;
        const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

        let posts = [];
        let followerCount = 0;
        let followerMap = new Map<string, number>();

        // We wrap the scraper calls to check for abort signal
        if (type === 'TOPIC') {
            console.log(`[ScrapeWorker] Scraping topic #${target} since ${since.toISOString()}...`);
            posts = await scraper.scrapeTopic(target, since);

            if (posts.length > 0) {
                if (controller.signal.aborted) throw new Error("Job timed out during scrape");
                console.log(`[ScrapeWorker] Resolving follower counts for ${posts.length} posts...`);
                followerMap = await resolveFollowerCounts(posts, scraper);
            }
        } else {
            console.log(`[ScrapeWorker] Scraping @${target} since ${since.toISOString()}...`);
            posts = await scraper.scrapeAccount(target, since);

            if (controller.signal.aborted) throw new Error("Job timed out during scrape");

            // Fetch (or use cached) follower count for this account
            followerCount = await getOrFetchFollowerCount(target, scraper);
            console.log(`[ScrapeWorker] @${target} follower count: ${followerCount}`);
        }

        console.log(`[ScrapeWorker] Found ${posts.length} posts for ${target}`);

        let newCount = 0;
        let failedFreshness = 0;
        let failedEngagement = 0;
        let unknownFollowers = 0;

        const discoveredAuthors = new Set<string>();

        for (const post of posts) {
            if (controller.signal.aborted) throw new Error("Job timed out during processing");

            // Skip empty posts
            if (!post.content && (!post.mediaUrls || post.mediaUrls.length === 0)) continue;

            // Determine follower count for this post
            const currentFollowerCount = type === 'TOPIC' ? (followerMap.get(post.authorId) ?? 0) : followerCount;
            if (type === 'TOPIC' && (followerMap.get(post.authorId) === undefined)) {
                unknownFollowers++;
            }

            const hasVideo = post.mediaUrls.some(m => m.type === 'video');
            if (hasVideo && post.postUrl) {
                try {
                    console.log(`[ScrapeWorker] Enriching video post: ${post.postUrl}`);
                    const enriched = await scraper.enrichPost(post.postUrl);
                    if (enriched && enriched.videoUrl) {
                        console.log(`[ScrapeWorker]   -> Found HQ video: ${enriched.videoUrl.substring(0, 50)}...`);
                        post.mediaUrls = post.mediaUrls.map(m => {
                            if (m.type === 'video') {
                                return {
                                    ...m,
                                    url: enriched.videoUrl!,
                                    coverUrl: enriched.coverUrl
                                };
                            }
                            return m;
                        });
                    }
                } catch (enrichErr: any) {
                    console.warn(`[ScrapeWorker]   ⚠ Enrichment failed for ${post.postUrl}: ${enrichErr.message}`);
                }
            }

            const savedPost = await processPost(
                {
                    ...post,
                    postedAt: post.postedAt ? new Date(post.postedAt) : undefined,
                },
                type === 'TOPIC' ? (post.authorUsername || `topic_${target}`) : target,
                workspaceId,
                settings,
                { skipTranslation },
                currentFollowerCount,
                sourceDetails
            );

            if (!savedPost) {
                const ageMs = post.postedAt ? Date.now() - new Date(post.postedAt).getTime() : 0;
                const ageHours = ageMs / (1000 * 60 * 60);
                if (ageHours > 72) failedFreshness++;
                else failedEngagement++;
                continue;
            }

            // Discovery: Collect author if they passed all filters
            if (type === 'TOPIC' && post.authorUsername) {
                discoveredAuthors.add(post.authorUsername);
            }

            newCount++;
            console.log(`[ScrapeWorker]   + New: ${savedPost.threadId} (score: ${savedPost.hotScore})`);

            // Upload media to storage if present
            if (savedPost.mediaUrls) {
                const mediaItems = Array.isArray(savedPost.mediaUrls) ? savedPost.mediaUrls : [];
                if (mediaItems.length > 0) {
                    let mediaUpdated = false;

                    const updatedMedia = await Promise.all(mediaItems.map(async (item: any, idx: number) => {
                        let newItem = { ...item };
                        if (item.url && !item.url.includes('threadsmonitorblobs.blob.core.windows.net')) {
                            try {
                                const extension = item.type === "video" ? ".mp4" : ".jpg";
                                const filename = `scraped/${Date.now()}_${savedPost.id}_${idx}${extension}`;
                                const storageUrl = await uploadMediaToStorage(item.url, filename);
                                newItem.url = storageUrl;
                                mediaUpdated = true;
                            } catch (mediaErr: any) {
                                console.error(`[ScrapeWorker]   ⚠ Media upload failed:`, mediaErr.message);
                            }
                        }
                        return newItem;
                    }));

                    if (mediaUpdated) {
                        await prisma.post.update({
                            where: { id: savedPost.id },
                            data: { mediaUrls: updatedMedia },
                        });
                    }
                }
            }
        }

        // discovery: Add new accounts as sources
        if (type === 'TOPIC' && discoveredAuthors.size > 0) {
            for (const username of discoveredAuthors) {
                try {
                    await prisma.scraperSource.upsert({
                        where: {
                            workspaceId_type_value: { workspaceId, type: 'ACCOUNT', value: username }
                        },
                        update: {},
                        create: {
                            workspaceId,
                            type: 'ACCOUNT',
                            value: username,
                            platform: 'THREADS',
                            isActive: true,
                            minLikes: 50,
                            minReplies: 0,
                            maxAgeHours: 24,
                            trustWeight: 1.0
                        }
                    });
                } catch (err) { }
            }
        }

        // structured logging
        if (sourceId) {
            await prisma.scrapeLog.create({
                data: {
                    sourceId: sourceId,
                    sourceType: type,
                    pagesScraped: 0,
                    rawCollected: posts.length,
                    failedFreshness,
                    failedEngagement,
                    unknownFollowers,
                    qualified: newCount,
                }
            });
        }

        console.log(`[ScrapeWorker] Done ${target}: ${newCount} new posts`);

        // Anti-memory leak: periodically restart scraper for this slot
        if (jobCounter % 10 === 0) {
            console.log(`[ScrapeWorker] Slot ${slotId} reached 10 jobs. Recycling browser...`);
            const scraper = scraperPool.get(slotId);
            if (scraper) {
                await scraper.close();
                scraperPool.delete(slotId);
            }
        }

        return { target, newCount, total: posts.length };

    } catch (error: any) {
        console.error(`[ScrapeWorker] Error processing job ${job.id}:`, error.message);

        // If we crashed or timed out, maybe the browser is in a bad state. Close it.
        const slotId = (jobCounter - 1) % CONCURRENCY;
        const scraper = scraperPool.get(slotId);
        if (scraper) {
            console.log(`[ScrapeWorker] Closing scraper in slot ${slotId} due to error.`);
            await scraper.close();
            scraperPool.delete(slotId);
        }

        throw error; // Let BullMQ handle the retry
    } finally {
        clearTimeout(timeout);
    }
}

// ─── Start Worker ────────────────────────────────────────────────────────────

console.log("=== Threads Scrape Worker ===");
console.log(`Starting with concurrency: ${CONCURRENCY}`);

const worker = new Worker<ScrapeJobData>(
    SCRAPE_QUEUE_NAME,
    processScrapeJob,
    {
        connection: redisConnection,
        concurrency: CONCURRENCY,
    }
);

worker.on("completed", (job) => {
    console.log(`[ScrapeWorker] ✅ Job ${job.id} completed (${job.returnvalue?.target})`);
});

worker.on("failed", (job, err) => {
    console.error(`[ScrapeWorker] ❌ Job ${job?.id} failed: ${err.message}`);
    if (job && job.attemptsMade < (job.opts.attempts || 3)) {
        console.log(`[ScrapeWorker] Will retry (${job.attemptsMade}/${job.opts.attempts})`);
    }
});

worker.on("error", (err) => {
    console.error("[ScrapeWorker] Worker error:", err);
});

// ─── Graceful Shutdown ───────────────────────────────────────────────────────

async function shutdown() {
    console.log("\n[ScrapeWorker] Shutting down gracefully...");

    await worker.close();

    for (const [, scraper] of scraperPool) {
        await scraper.close();
    }

    console.log("[ScrapeWorker] All scrapers closed. Goodbye.");
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

console.log(`Waiting for scrape jobs from queue "${SCRAPE_QUEUE_NAME}"...\n`);
