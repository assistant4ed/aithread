import { prisma } from "../lib/prisma";

async function main() {
    const workspace = await prisma.workspace.findFirst();
    if (!workspace) {
        console.error("No workspace found to seed pipeline runs for.");
        return;
    }

    console.log(`Seeding pipeline runs for workspace: ${workspace.name} (${workspace.id})`);

    const steps = ["SCRAPE", "SYNTHESIS", "PUBLISH"] as const;
    const statuses = ["COMPLETED", "FAILED", "RUNNING"] as const;

    for (const step of steps) {
        const status = statuses[Math.floor(Math.random() * statuses.length)];
        const startedAt = new Date(Date.now() - Math.random() * 3600000); // within last hour
        const completedAt = status === "RUNNING" ? null : new Date(startedAt.getTime() + Math.random() * 300000); // 0-5 mins duration

        await prisma.pipelineRun.create({
            data: {
                workspaceId: workspace.id,
                step,
                status,
                startedAt,
                completedAt,
                error: status === "FAILED" ? "Mock error for verification" : null,
                metadata: { mock: true },
            },
        });
    }

    console.log("Seeding complete.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
