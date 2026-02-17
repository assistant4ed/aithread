import "dotenv/config";
import { Worker, Job } from "bullmq";
import { SCRAPE_QUEUE_NAME, ScrapeJobData, redisConnection } from "../lib/queue";
import { ThreadsScraper } from "../lib/scraper";
import { processPost } from "../lib/processor";
import { uploadMediaToGCS } from "../lib/storage";
import { prisma } from "../lib/prisma";

const CONCURRENCY = parseInt(process.env.SCRAPER_CONCURRENCY || "3", 10);

// Each concurrent worker slot gets its own scraper (own Puppeteer browser)
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

// ─── Job Processor ───────────────────────────────────────────────────────────

async function processScrapeJob(job: Job<ScrapeJobData>) {
    const { username, workspaceId, settings, skipTranslation } = job.data;
    const slotId = jobCounter++ % CONCURRENCY;

    console.log(`[ScrapeWorker] Processing @${username} (workspace: ${workspaceId}, slot: ${slotId}, attempt: ${job.attemptsMade + 1})`);

    const scraper = await getScraperForSlot(slotId);

    // Rate-limit delay (stagger requests)
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

    const posts = await scraper.scrapeAccount(username);
    console.log(`[ScrapeWorker] Found ${posts.length} posts for @${username}`);

    let newCount = 0;


    for (const post of posts) {
        // Skip empty posts
        if (!post.content && (!post.mediaUrls || post.mediaUrls.length === 0)) continue;

        // Enrich video posts (only if they look like low-quality dash urls or we just want better metadata)
        // We do this BEFORE processPost so the DB gets the high-quality URL immediately
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
                            url: enriched.videoUrl!, // guaranteed by check
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
            username,
            workspaceId,
            settings,
            { skipTranslation }
        );

        if (!savedPost) {
            continue; // Already exists, stats updated
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


    console.log(`[ScrapeWorker] Done @${username}: ${newCount} new posts`);
    return { username, newCount, total: posts.length };
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
    console.log(`[ScrapeWorker] ✅ Job ${job.id} completed (${job.returnvalue?.username})`);
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
