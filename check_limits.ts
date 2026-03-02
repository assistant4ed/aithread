import { prisma } from "./lib/prisma";

async function main() {
  const workspaces = await prisma.workspace.findMany();
  for (const ws of workspaces) {
    const run = await prisma.pipelineRun.findFirst({
      where: { workspaceId: ws.id, step: "SCRAPE" },
      orderBy: { startedAt: "desc" }
    });
    if (run) {
      console.log(`Workspace: ${ws.name}, StartedAt: ${run.startedAt}, Status: ${run.status}, Metadata: ${JSON.stringify(run.metadata)}`);
    }
  }
}
main().catch(console.error).finally(() => prisma.$disconnect());
