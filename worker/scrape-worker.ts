import "dotenv/config";
import { Worker, Job } from "bullmq";
import { SCRAPE_QUEUE_NAME, ScrapeJobData, redisConnection } from "../lib/queue";
import { ThreadsScraper } from "../lib/scraper";
import { processPost } from "../lib/processor";
import { uploadMediaToGCS } from "../lib/storage";
import { prisma } from "../lib/prisma";

const CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY || "3", 10);

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
    const { target, type, workspaceId, settings, skipTranslation, sourceId } = job.data;
    const slotId = jobCounter++ % CONCURRENCY;

    console.log(`[ScrapeWorker] Processing ${type}:${target} (workspace: ${workspaceId}, slot: ${slotId}, attempt: ${job.attemptsMade + 1})`);

    const scraper = await getScraperForSlot(slotId);

    // Fetch source details if sourceId is provided
    let sourceDetails: any = null;
    if (sourceId) {
        sourceDetails = await prisma.scraperSource.findUnique({ where: { id: sourceId } });
    }

    // Rate-limit delay (stagger requests)
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

    const maxAgeHours = settings?.maxPostAgeHours || 172;
    const since = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);

    let posts = [];
    let followerCount = 0;

    if (type === 'TOPIC') {
        console.log(`[ScrapeWorker] Scraping topic #${target} since ${since.toISOString()}...`);
        posts = await scraper.scrapeTopic(target, since);
    } else {
        console.log(`[ScrapeWorker] Scraping @${target} since ${since.toISOString()}...`);
        posts = await scraper.scrapeAccount(target, since);
        // Fetch (or use cached) follower count for this account
        followerCount = await getOrFetchFollowerCount(target, scraper);
        console.log(`[ScrapeWorker] @${target} follower count: ${followerCount}`);
    }

    console.log(`[ScrapeWorker] Found ${posts.length} posts for ${target}`);

    let newCount = 0;

    for (const post of posts) {
        // Skip empty posts
        if (!post.content && (!post.mediaUrls || post.mediaUrls.length === 0)) continue;

        const hasVideo = post.mediaUrls.some(m => m.type === 'video');
        if (hasVideo && post.postUrl) {
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
            } else {
                console.log(`[ScrapeWorker]   -> No better video found.`);
            }
        }

        const savedPost = await processPost(
            {
                ...post,
                postedAt: post.postedAt ? new Date(post.postedAt) : undefined,
            },
            type === 'TOPIC' ? `#${target}` : target,
            workspaceId,
            settings,
            { skipTranslation },
            followerCount,
            sourceDetails
        );

        if (!savedPost) {
            continue; // Already exists, stats updated, or rejected by gates
        }

        newCount++;
        console.log(`[ScrapeWorker]   + New: ${savedPost.threadId} (score: ${savedPost.hotScore})`);

        // Upload media to GCS if present
        if (savedPost.mediaUrls) {
            const mediaItems = Array.isArray(savedPost.mediaUrls) ? savedPost.mediaUrls : [];
            if (mediaItems.length > 0) {
                let mediaUpdated = false;

                const updatedMedia = await Promise.all(mediaItems.map(async (item: any, idx: number) => {
                    let newItem = { ...item };

                    // Upload main URL (Video or Image)
                    if (item.url && !item.url.includes('storage.googleapis.com')) {
                        try {
                            const extension = item.type === "video" ? ".mp4" : ".jpg";
                            const filename = `scraped/${Date.now()}_${savedPost.id}_${idx}${extension}`;
                            const gcsUrl = await uploadMediaToGCS(item.url, filename);
                            console.log(`[ScrapeWorker]   📎 Media uploaded: ${gcsUrl}`);
                            newItem.url = gcsUrl;
                            mediaUpdated = true;
                        } catch (mediaErr: any) {
                            console.error(`[ScrapeWorker]   ⚠ Media upload failed:`, mediaErr.message);
                        }
                    }

                    // Upload cover URL if present and valid
                    if (item.coverUrl && !item.coverUrl.includes('storage.googleapis.com')) {
                        try {
                            const filename = `scraped/${Date.now()}_${savedPost.id}_${idx}_cover.jpg`;
                            const gcsUrl = await uploadMediaToGCS(item.coverUrl, filename);
                            console.log(`[ScrapeWorker]   📎 Cover uploaded: ${gcsUrl}`);
                            newItem.coverUrl = gcsUrl;
                            mediaUpdated = true;
                        } catch (mediaErr: any) {
                            console.error(`[ScrapeWorker]   ⚠ Cover upload failed:`, mediaErr.message);
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


    console.log(`[ScrapeWorker] Done ${target}: ${newCount} new posts`);
    return { target, newCount, total: posts.length };
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
