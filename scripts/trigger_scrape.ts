
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { scrapeQueue, ScrapeJobData } from "../lib/queue";
import { WorkspaceSettings } from "../lib/processor";

async function main() {
    console.log("=== Manual Scrape Trigger ===");

    const workspaceId = process.argv[2];

    const query: any = workspaceId
        ? { where: { id: workspaceId, isActive: true }, include: { sources: true } }
        : { where: { isActive: true }, include: { sources: true } };

    const workspaces = await prisma.workspace.findMany(query);

    if (workspaces.length === 0) {
        console.log("No matching active workspaces found.");
        return;
    }

    for (const ws of workspaces as any[]) {
        console.log(`\nWorkspace: ${ws.name} (${ws.id})`);

        const settings: WorkspaceSettings = {
            translationPrompt: ws.translationPrompt,
            hotScoreThreshold: ws.hotScoreThreshold,
            topicFilter: ws.topicFilter,
            maxPostAgeHours: ws.maxPostAgeHours,
        };

        // 1. Process ScraperSource (New System)
        for (const source of ws.sources) {
            if (!source.isActive) continue;

            const jobData: ScrapeJobData = {
                target: source.value,
                type: source.type,
                workspaceId: ws.id,
                settings,
                skipTranslation: false,
                sourceId: source.id,
            };

            await scrapeQueue.add(`scrape-${source.id}-${Date.now()}`, jobData);
            console.log(`  -> Enqueued ${source.type}: ${source.value}`);
        }

        // 2. Process legacy targetAccounts (Backward Compatibility)
        for (const username of ws.targetAccounts) {
            // Skip if already in sources as an ACCOUNT
            if (ws.sources.some((s: any) => s.type === 'ACCOUNT' && s.value === username)) continue;

            const jobData: ScrapeJobData = {
                target: username,
                type: 'ACCOUNT',
                workspaceId: ws.id,
                settings,
                skipTranslation: false
            };
            await scrapeQueue.add("scrape-account", jobData, { jobId: `manual-legacy-${Date.now()}-${username}` });
            console.log(`  -> Enqueued Legacy ACCOUNT: @${username}`);
        }
    }
    await prisma.$disconnect();
    process.exit(0);
}
main().catch(console.error);
