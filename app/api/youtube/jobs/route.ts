import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { youtubeQueue } from "@/lib/queue";
import { prisma } from "@/lib/prisma";

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

        // Create Database Record First
        const dbJob = await prisma.youtubeJob.create({
            data: {
                videoUrl,
                language,
                status: "PENDING",
                requestedById: session.user.id
            }
        });

        const job = await youtubeQueue.add("process-video", {
            dbJobId: dbJob.id,
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
        // Query the database for the user's jobs
        const dbJobs = await prisma.youtubeJob.findMany({
            where: {
                requestedById: session.user.id
            },
            orderBy: {
                createdAt: 'desc'
            },
            take: 20
        });

        // We can optionally format this to match the previous structure
        // or just return the DB records directly. Returning DB records is cleaner.
        return NextResponse.json({ jobs: dbJobs });
    } catch (error: any) {
        console.error("[YouTube API] Error fetching jobs:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
