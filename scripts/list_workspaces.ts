import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const workspaces = await prisma.workspace.findMany({
        select: { id: true, name: true, contentMode: true, publishTimes: true }
    });
    console.log("Available workspaces:");
    workspaces.forEach(w => {
        console.log(`  ${w.id} - ${w.name} (${w.contentMode})`);
        console.log(`    Publish times: ${w.publishTimes.join(", ")}`);
    });
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
