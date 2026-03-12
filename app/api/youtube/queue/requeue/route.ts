import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { youtubeQueue } from "@/lib/queue";

/**
 * POST /api/youtube/queue/requeue
 *
 * Requeues PENDING YouTube jobs that are stuck (not in BullMQ queue).
 * This fixes the issue where jobs exist in database but weren't added to Redis.
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Find all PENDING jobs
        const pendingJobs = await prisma.youtubeJob.findMany({
            where: {
                status: 'PENDING'
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 50 // Limit to prevent overwhelming the queue
        });

        console.log(`[YouTube Requeue] Found ${pendingJobs.length} pending jobs`);

        let requeuedCount = 0;

        for (const job of pendingJobs) {
            try {
                // Add job to BullMQ queue
                await youtubeQueue.add('process-video', {
                    dbJobId: job.id,
                    videoUrl: job.videoUrl,
                    outputLanguage: job.language,
                    includeFrames: true,
                    requestedBy: job.requestedById
                });

                requeuedCount++;
                console.log(`[YouTube Requeue] Requeued job ${job.id}: ${job.videoUrl}`);
            } catch (err: any) {
                console.error(`[YouTube Requeue] Failed to requeue job ${job.id}:`, err.message);
            }
        }

        console.log(`[YouTube Requeue] ✅ Requeued ${requeuedCount}/${pendingJobs.length} jobs`);

        return NextResponse.json({
            success: true,
            message: `Requeued ${requeuedCount} pending jobs`,
            total: pendingJobs.length,
            requeued: requeuedCount
        });

    } catch (error: any) {
        console.error("[YouTube Requeue] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
