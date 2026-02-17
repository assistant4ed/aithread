import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
    console.log("Checking Prisma Client schema...");
    try {
        const workspace = await prisma.workspace.findFirst();
        console.log("Workspace found:", workspace);
        if (workspace && 'synthesisLanguage' in workspace) {
            console.log("✅ synthesisLanguage exists in Prisma Client");
        } else {
            console.log("❌ synthesisLanguage MISSING in Prisma Client");
        }
    } catch (e) {
        console.error("Error:", e);
    } finally {
        await prisma.$disconnect();
    }
}

main();
