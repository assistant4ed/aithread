import { prisma } from "./prisma";
import { GenerationStatus } from "@prisma/client";

/**
 * Generation Tracker
 *
 * Provides real-time progress tracking for content generation across all modes.
 * Creates GenerationRun records in database for persistence and UI polling.
 */

export interface GenerationProgressUpdate {
    status?: GenerationStatus;
    currentStep?: number;
    totalSteps?: number;
    currentTopic?: string;
    progress?: number; // 0-100
    articlesCreated?: number;
    errorMessage?: string;
    metadata?: Record<string, any>;
}

/**
 * Start tracking a new generation run
 */
export async function startGeneration(workspaceId: string, totalSteps: number = 5): Promise<string> {
    // Clean up any stuck "in-progress" runs older than 10 minutes
    const tenMinutesAgo = new Date(Date.now() - 10 * 60_000);
    await prisma.generationRun.updateMany({
        where: {
            workspaceId,
            status: { notIn: ["COMPLETED", "ERROR"] },
            startedAt: { lt: tenMinutesAgo }
        },
        data: {
            status: "ERROR",
            errorMessage: "Generation timeout - worker may have crashed",
            completedAt: new Date()
        }
    });

    // Create new run
    const run = await prisma.generationRun.create({
        data: {
            workspaceId,
            totalSteps,
            progress: 0,
            status: "DISCOVERING"
        }
    });

    console.log(`[GenerationTracker] Started tracking for workspace ${workspaceId} (run: ${run.id})`);
    return run.id;
}

/**
 * Update progress of an ongoing generation run
 */
export async function updateProgress(
    runId: string,
    update: GenerationProgressUpdate
): Promise<void> {
    const data: any = { updatedAt: new Date() };

    if (update.status !== undefined) data.status = update.status;
    if (update.currentStep !== undefined) data.currentStep = update.currentStep;
    if (update.totalSteps !== undefined) data.totalSteps = update.totalSteps;
    if (update.currentTopic !== undefined) data.currentTopic = update.currentTopic;
    if (update.progress !== undefined) data.progress = Math.min(100, Math.max(0, update.progress));
    if (update.articlesCreated !== undefined) data.articlesCreated = update.articlesCreated;
    if (update.errorMessage !== undefined) data.errorMessage = update.errorMessage;
    if (update.metadata !== undefined) data.metadata = update.metadata;

    await prisma.generationRun.update({
        where: { id: runId },
        data
    });

    // Log significant progress
    if (update.status || update.currentStep || update.currentTopic) {
        const statusMsg = update.status ? `[${update.status}]` : "";
        const stepMsg = update.currentStep ? `Step ${update.currentStep}/${data.totalSteps || "?"}` : "";
        const topicMsg = update.currentTopic ? `"${update.currentTopic}"` : "";
        console.log(`[GenerationTracker] ${statusMsg} ${stepMsg} ${topicMsg}`.trim());
    }
}

/**
 * Mark generation as successfully completed
 */
export async function completeGeneration(
    runId: string,
    articlesCreated: number = 0
): Promise<void> {
    await prisma.generationRun.update({
        where: { id: runId },
        data: {
            status: "COMPLETED",
            progress: 100,
            articlesCreated,
            completedAt: new Date()
        }
    });

    console.log(`[GenerationTracker] Completed run ${runId} - ${articlesCreated} article(s) created`);
}

/**
 * Mark generation as failed with error
 */
export async function failGeneration(
    runId: string,
    errorMessage: string
): Promise<void> {
    await prisma.generationRun.update({
        where: { id: runId },
        data: {
            status: "ERROR",
            errorMessage,
            completedAt: new Date()
        }
    });

    console.error(`[GenerationTracker] Failed run ${runId}: ${errorMessage}`);
}

/**
 * Get current generation status for a workspace
 */
export async function getGenerationStatus(workspaceId: string) {
    const activeRun = await prisma.generationRun.findFirst({
        where: {
            workspaceId,
            status: { notIn: ["COMPLETED", "ERROR"] }
        },
        orderBy: { startedAt: "desc" }
    });

    const recentRuns = await prisma.generationRun.findMany({
        where: { workspaceId },
        orderBy: { startedAt: "desc" },
        take: 10
    });

    return {
        active: activeRun,
        recent: recentRuns
    };
}

/**
 * Calculate time elapsed since generation started
 */
export function getElapsedTime(startedAt: Date): string {
    const seconds = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
}

/**
 * Helper to wrap a generation function with automatic tracking
 */
export async function withTracking<T>(
    workspaceId: string,
    totalSteps: number,
    generationFn: (runId: string) => Promise<T>
): Promise<T> {
    const runId = await startGeneration(workspaceId, totalSteps);

    try {
        const result = await generationFn(runId);
        // Note: completeGeneration should be called explicitly by the generation function
        // to properly report articlesCreated count
        return result;
    } catch (error: any) {
        await failGeneration(runId, error.message || String(error));
        throw error;
    }
}
