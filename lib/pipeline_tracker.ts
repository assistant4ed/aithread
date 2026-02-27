import { prisma } from "./prisma";

export type PipelineStep = "SCRAPE" | "SYNTHESIS" | "PUBLISH";

export async function trackPipelineRun<T>(
    workspaceId: string,
    step: PipelineStep,
    fn: () => Promise<T>
): Promise<T> {
    const run = await prisma.pipelineRun.create({
        data: {
            workspaceId,
            step: step as any,
            status: "RUNNING" as any
        },
    });

    const startTime = Date.now();

    try {
        const result = await fn();
        const durationMs = Date.now() - startTime;

        await prisma.pipelineRun.update({
            where: { id: run.id },
            data: {
                status: "COMPLETED" as any,
                completedAt: new Date(),
                metadata: typeof result === "object" ? (result as any) : undefined,
            },
        });
        return result;
    } catch (error: any) {
        console.error(`[PipelineTracker] ${step} failed for ${workspaceId}:`, error);

        await prisma.pipelineRun.update({
            where: { id: run.id },
            data: {
                status: "FAILED" as any,
                completedAt: new Date(),
                error: error.message?.substring(0, 500) || "Unknown error",
            },
        });
        throw error;
    }
}
