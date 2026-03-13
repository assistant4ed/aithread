#!/usr/bin/env tsx
/**
 * Requeues all PENDING YouTube jobs to the BullMQ queue.
 * Useful for jobs that got stuck when worker was scaled to zero.
 */

import { prisma } from "../lib/prisma";
import { youtubeQueue } from "../lib/queue";

async function main() {
    console.log("[Requeue] Finding PENDING YouTube jobs...");

    const pendingJobs = await prisma.youtubeJob.findMany({
        where: {
            status: 'PENDING'
        },
        orderBy: {
            createdAt: 'desc'
        }
    });

    console.log(`[Requeue] Found ${pendingJobs.length} pending jobs`);

    if (pendingJobs.length === 0) {
        console.log("[Requeue] No pending jobs to requeue.");
        return;
    }

    let requeuedCount = 0;

    for (const job of pendingJobs) {
        try {
            // Validate language
            const validLanguages = ['zh-HK', 'en', 'zh-TW'] as const;
            type ValidLanguage = typeof validLanguages[number];
            const outputLanguage: ValidLanguage = validLanguages.includes(job.language as ValidLanguage)
                ? (job.language as ValidLanguage)
                : 'en';

            // Add to BullMQ queue
            await youtubeQueue.add('process-video', {
                dbJobId: job.id,
                videoUrl: job.videoUrl,
                outputLanguage,
                includeFrames: true,
                requestedBy: job.requestedById
            });

            requeuedCount++;
            console.log(`[Requeue] ✅ Requeued job ${job.id}: ${job.videoUrl}`);
        } catch (err: any) {
            console.error(`[Requeue] ❌ Failed to requeue job ${job.id}:`, err.message);
        }
    }

    console.log(`\n[Requeue] Summary: Requeued ${requeuedCount}/${pendingJobs.length} jobs`);
}

main()
    .catch((err) => {
        console.error("[Requeue] Fatal error:", err);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
        await youtubeQueue.close();
    });
