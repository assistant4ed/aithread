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
        if (!post.content && (!post.mediaUrls || post.mediaUrls.length === 0)) continue;

        const savedPost = await processPost(
            post,
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
                try {
                    const firstItem = mediaItems[0] as { url: string; type: string };
                    const extension = firstItem.type === "video" ? ".mp4" : ".jpg";
                    const filename = `scraped/${Date.now()}_${savedPost.id}${extension}`;
                    const gcsUrl = await uploadMediaToGCS(firstItem.url, filename);
                    console.log(`[ScrapeWorker]   📎 Media uploaded: ${gcsUrl}`);

                    // Persist the GCS URL so the publisher uses it instead of the expired CDN URL
                    const updatedMedia = mediaItems.map((item: any, idx: number) =>
                        idx === 0 ? { ...item, url: gcsUrl } : item
                    );
                    await prisma.post.update({
                        where: { id: savedPost.id },
                        data: { mediaUrls: updatedMedia },
                    });
                } catch (mediaErr) {
                    console.error(`[ScrapeWorker]   ⚠ Media upload failed:`, mediaErr);
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
