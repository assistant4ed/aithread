import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
    console.log("Checking database...");
    try {
        const workspaces = await prisma.workspace.findMany({
            where: { isActive: true },
        });
        console.log(`Found ${workspaces.length} active workspaces.`);

        workspaces.forEach(ws => {
            console.log(`- ${ws.name} (${ws.id}): ${ws.targetAccounts.length} accounts`);
            console.log(`  Accounts: ${ws.targetAccounts.join(", ")}`);
        });

    } catch (e) {
        console.error("Error querying database:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
