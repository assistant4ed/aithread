
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { scrapeQueue, ScrapeJobData } from "../lib/queue";
import { WorkspaceSettings } from "../lib/processor";

async function main() {
    const workspaceName = process.argv[2];
    if (!workspaceName) {
        console.error("Usage: npx tsx scripts/manual_scrape.ts <workspace_name>");
        process.exit(1);
    }

    console.log(`=== Manual Scraper for [${workspaceName}] ===`);

    // Debug: Check DB Port
    const dbUrl = process.env.DATABASE_URL || "";
    const portMatch = dbUrl.match(/:(\d+)\//);
    const actualPort = portMatch ? portMatch[1] : "unknown";
    console.log(`[Debug] Using Database Port: ${actualPort}`);

    try {
        const ws = await (prisma as any).workspace.findFirst({
            where: {
                OR: [
                    { id: workspaceName },
                    { name: workspaceName }
                ]
            },
            include: { sources: true }
        });

        if (!ws) {
            console.error(`Error: Workspace "${workspaceName}" not found.`);
            process.exit(1);
        }

        const sources = ws.sources || [];

        if (sources.length === 0) {
            console.error(`Error: Workspace "${ws.name}" has no scraper sources.`);
            process.exit(1);
        }

        const settings: WorkspaceSettings = {
            translationPrompt: ws.translationPrompt || "",
            hotScoreThreshold: ws.hotScoreThreshold,
            topicFilter: ws.topicFilter,
            maxPostAgeHours: ws.maxPostAgeHours,
        };

        console.log(`Enqueuing jobs for ${ws.name}...`);
        let count = 0;

        // 1. Process ScraperSource (New System)
        for (const source of sources) {
            if (!source.isActive) continue;

            const jobData: ScrapeJobData = {
                target: source.value,
                type: source.type,
                workspaceId: ws.id,
                settings,
                skipTranslation: false,
                sourceId: source.id,
            };

            await scrapeQueue.add(`manual-scrape-${source.id}-${Date.now()}`, jobData, {
                removeOnComplete: true,
                removeOnFail: { count: 100 },
            });
            console.log(`  + Enqueued Source: [${source.type}] ${source.value}`);
            count++;
        }

        console.log("\nDone! Check the 'npm run worker:scraper' terminal for real-time logs.");

    } catch (error: any) {
        console.error("Fatal Error:", error.message);
        if (error.message.includes("6543")) {
            console.log("\n[Fix Tip] It seems port 6543 is still being used. Try running: 'unset DATABASE_URL' before starting the script.");
        }
    } finally {
        await prisma.$disconnect();
    }
}

main();
