import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getGenerationStatus, getElapsedTime } from "@/lib/generation_tracker";

/**
 * GET /api/workspaces/[id]/generation-status
 *
 * Returns the current and recent generation status for a workspace.
 * Used by UI to poll for real-time generation progress.
 */
export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { id: workspaceId } = await params;

        // Verify ownership
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { ownerId: true, name: true }
        });

        if (!workspace) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        if (workspace.ownerId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        // Get generation status
        const status = await getGenerationStatus(workspaceId);

        // Format response
        const response = {
            active: status.active ? {
                id: status.active.id,
                status: status.active.status,
                currentStep: status.active.currentStep,
                totalSteps: status.active.totalSteps,
                currentTopic: status.active.currentTopic,
                progress: status.active.progress,
                articlesCreated: status.active.articlesCreated,
                startedAt: status.active.startedAt,
                elapsed: getElapsedTime(status.active.startedAt),
                errorMessage: status.active.errorMessage,
                metadata: status.active.metadata
            } : null,
            recent: status.recent.map(run => ({
                id: run.id,
                status: run.status,
                articlesCreated: run.articlesCreated,
                startedAt: run.startedAt,
                completedAt: run.completedAt,
                duration: run.completedAt
                    ? Math.round((run.completedAt.getTime() - run.startedAt.getTime()) / 1000)
                    : null,
                errorMessage: run.errorMessage
            }))
        };

        return NextResponse.json(response);

    } catch (error) {
        console.error("[API/GenerationStatus] Error:", error);
        return NextResponse.json(
            { error: "Internal server error" },
            { status: 500 }
        );
    }
}
