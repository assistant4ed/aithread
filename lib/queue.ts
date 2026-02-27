import { Queue, ConnectionOptions } from "bullmq";
import { WorkspaceSettings } from "./processor";
import type { YouTubeJobPayload } from "./youtube/types/youtube";


const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";

/**
 * Parse REDIS_URL into a BullMQ-compatible ConnectionOptions object.
 * Works with Upstash, Railway, local Redis, etc.
 */
function parseRedisUrl(url: string): ConnectionOptions {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: parseInt(parsed.port || "6379", 10),
        password: parsed.password || undefined,
        username: parsed.username || undefined,
        tls: parsed.protocol === "rediss:" ? {
            checkServerIdentity: () => undefined, // potentially help with some self-signed certs (though Upstash usually fine)
        } : undefined,
        maxRetriesPerRequest: null, // Required by BullMQ
        enableReadyCheck: false,
        connectTimeout: 30000,
        keepAlive: 1000,
        family: 4, // Force IPv4
    };
}

/**
 * Shared connection options for BullMQ Queue and Worker.
 */
export const redisConnection: ConnectionOptions = parseRedisUrl(REDIS_URL);


export const SCRAPE_QUEUE_NAME = "scrape-accounts";
export const YOUTUBE_QUEUE_NAME = "youtube-automation";

export interface ScrapeJobData {
    target: string; // username or hashtag
    type: 'ACCOUNT' | 'TOPIC';
    workspaceId: string;
    settings: WorkspaceSettings;
    skipTranslation: boolean;
    sourceId?: string;
}

/**
 * The producer-side queue. Use this to add jobs.
 */
export const scrapeQueue = new Queue<ScrapeJobData>(SCRAPE_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 2, // Reduced for faster feedback on manual trigger
        backoff: {
            type: "exponential",
            delay: 15_000, // 15s start
        },
        removeOnComplete: { count: 300 },
        removeOnFail: { count: 100 },
    },
});

export const youtubeQueue = new Queue<YouTubeJobPayload>(YOUTUBE_QUEUE_NAME, {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 1, // Scripts can be expensive/slow, maybe don't auto-retry too much
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 50 },
    },
});

/**
 * Removes all pending (waiting/delayed) scrape jobs for a specific workspace.
 * Used to stop scraping when synthesis begins, preventing resource waste.
 */
export async function removePendingScrapes(workspaceId: string) {
    // Get waiting and delayed jobs
    const jobs = await scrapeQueue.getJobs(['waiting', 'delayed'], 0, 1000, true);

    let removedCount = 0;
    const removalPromises = [];

    for (const job of jobs) {
        if (job.data && job.data.workspaceId === workspaceId) {
            removalPromises.push(job.remove());
            removedCount++;
        }
    }

    await Promise.all(removalPromises);

    if (removedCount > 0) {
        console.log(`[Queue] Removed ${removedCount} pending scrape jobs for workspace ${workspaceId}`);
    }
}
