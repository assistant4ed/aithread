import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { youtubeQueue } from "@/lib/queue";

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { videoUrl, language = "zh-HK", includeFrames = true } = await req.json();

        if (!videoUrl) {
            return NextResponse.json({ error: "videoUrl is required" }, { status: 400 });
        }

        console.log(`[YouTube API] Queuing job for: ${videoUrl} (Lang: ${language})`);

        const job = await youtubeQueue.add("process-video", {
            videoUrl,
            outputLanguage: language,
            includeFrames,
            requestedBy: session.user.id
        });

        return NextResponse.json({
            success: true,
            jobId: job.id,
            message: "Job queued successfully"
        });

    } catch (error: any) {
        console.error("[YouTube API] Error queuing job:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        // Get last 20 jobs from the queue to show status
        const jobs = await youtubeQueue.getJobs(["waiting", "active", "completed", "failed", "delayed"], 0, 19, false);

        const jobData = await Promise.all(jobs.map(async (job) => {
            const state = await job.getState();
            return {
                id: job.id,
                data: job.data,
                state,
                progress: job.progress,
                failedReason: job.failedReason,
                timestamp: job.timestamp,
                finishedOn: job.finishedOn,
                result: job.returnvalue
            };
        }));

        return NextResponse.json({ jobs: jobData });
    } catch (error: any) {
        console.error("[YouTube API] Error fetching jobs:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
