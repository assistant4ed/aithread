import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { Queue } from "bullmq";
import { redisConnection, YOUTUBE_QUEUE_NAME } from "@/lib/queue";

/**
 * POST /api/youtube/queue/clean
 *
 * Cleans the YouTube automation queue by removing failed, completed, and stale jobs.
 * Requires authentication.
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const queue = new Queue(YOUTUBE_QUEUE_NAME, { connection: redisConnection });

        // Get all job statuses
        const [waiting, active, delayed, failed, completed] = await Promise.all([
            queue.getWaiting(),
            queue.getActive(),
            queue.getDelayed(),
            queue.getFailed(),
            queue.getCompleted()
        ]);

        console.log('[YouTube Queue Clean] Queue status:', {
            waiting: waiting.length,
            active: active.length,
            delayed: delayed.length,
            failed: failed.length,
            completed: completed.length
        });

        let totalRemoved = 0;

        // Remove failed jobs
        if (failed.length > 0) {
            console.log(`[YouTube Queue Clean] Removing ${failed.length} failed jobs...`);
            for (const job of failed) {
                await job.remove();
                totalRemoved++;
            }
        }

        // Remove completed jobs
        if (completed.length > 0) {
            console.log(`[YouTube Queue Clean] Removing ${completed.length} completed jobs...`);
            for (const job of completed) {
                await job.remove();
                totalRemoved++;
            }
        }

        // Remove stale waiting jobs (older than 10 minutes)
        const tenMinutesAgo = Date.now() - 10 * 60 * 1000;
        const staleWaiting = waiting.filter(j => j.timestamp < tenMinutesAgo);
        if (staleWaiting.length > 0) {
            console.log(`[YouTube Queue Clean] Removing ${staleWaiting.length} stale waiting jobs...`);
            for (const job of staleWaiting) {
                await job.remove();
                totalRemoved++;
            }
        }

        // Remove stale active jobs (older than 30 minutes - likely crashed worker)
        const thirtyMinutesAgo = Date.now() - 30 * 60 * 1000;
        const staleActive = active.filter(j => j.timestamp < thirtyMinutesAgo);
        if (staleActive.length > 0) {
            console.log(`[YouTube Queue Clean] Removing ${staleActive.length} stale active jobs...`);
            for (const job of staleActive) {
                await job.remove();
                totalRemoved++;
            }
        }

        await queue.close();

        console.log(`[YouTube Queue Clean] ✅ Queue cleaned! Removed ${totalRemoved} jobs.`);

        return NextResponse.json({
            success: true,
            message: `Queue cleaned successfully. Removed ${totalRemoved} jobs.`,
            before: {
                waiting: waiting.length,
                active: active.length,
                delayed: delayed.length,
                failed: failed.length,
                completed: completed.length
            },
            removed: totalRemoved
        });

    } catch (error: any) {
        console.error("[YouTube Queue Clean] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
