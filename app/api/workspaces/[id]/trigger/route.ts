import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { scrapeQueue, ScrapeJobData } from "@/lib/queue";
import { getDailyPublishCount } from "@/lib/publisher_service";
import { WorkspaceSettings } from "@/lib/processor";
import { trackPipelineRun } from "@/lib/pipeline_tracker";

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const { id: workspaceId } = await params;
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            include: { sources: true }
        });

        if (!workspace) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        // 1. Validation: Check if a job for this workspace is already active
        const activeRun = await prisma.pipelineRun.findFirst({
            where: {
                workspaceId,
                step: 'SCRAPE',
                status: 'RUNNING',
                startedAt: { gte: new Date(Date.now() - 15 * 60_000) } // Within last 15 mins
            }
        });

        if (activeRun) {
            return NextResponse.json({
                error: "Job already running",
                message: "A scrape job is already active for this workspace."
            }, { status: 409 });
        }

        // 2. Daily Rate Limit Check (Optional but recommended)
        const postsToday = await getDailyPublishCount(workspaceId);
        const limitReached = postsToday >= workspace.dailyPostLimit;

        // 3. Queue Injection (High Priority)
        const sources = workspace.sources.filter(s => s.isActive);

        if (sources.length === 0) {
            return NextResponse.json({ error: "No active sources found" }, { status: 400 });
        }

        const settings: WorkspaceSettings = {
            translationPrompt: workspace.translationPrompt || "",
            hotScoreThreshold: workspace.hotScoreThreshold,
            topicFilter: workspace.topicFilter,
            maxPostAgeHours: workspace.maxPostAgeHours,
            aiProvider: workspace.aiProvider,
            aiModel: workspace.aiModel,
            aiApiKey: workspace.aiApiKey,
        };

        // Track the run
        await trackPipelineRun(workspaceId, "SCRAPE", async () => {
            let count = 0;
            for (const source of sources) {
                const jobData: ScrapeJobData = {
                    target: source.value,
                    type: source.type,
                    workspaceId,
                    settings,
                    skipTranslation: limitReached,
                    sourceId: source.id,
                };

                // Use consistent Job ID format and priority: 1 (High)
                // In BullMQ, lower priority number = higher priority? 
                // Wait, default is high priority? Actually, in BullMQ 4+, priority: 1 is higher than default.
                await scrapeQueue.add(`scrape:${workspaceId}:${source.id}`, jobData, {
                    priority: 1, // High Priority
                    jobId: `scrape:${workspaceId}:${source.id}`, // Deduplication
                    removeOnComplete: true,
                    removeOnFail: { count: 100 },
                });
                count++;
            }
            return { jobsEnqueued: count, manual: true, limitReached };
        });

        return NextResponse.json({
            message: `Manual scrape triggered. Enqueued ${sources.length} sources.`,
            enqueuedCount: sources.length
        });

    } catch (error: any) {
        console.error("Error triggering manual scrape:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
