
import "dotenv/config";
import { prisma } from "../lib/prisma";
import { scrapeQueue, ScrapeJobData } from "../lib/queue";
import { WorkspaceSettings } from "../lib/processor";

async function main() {
    console.log("=== Manual Scrape Trigger ===");
    const workspaces = await prisma.workspace.findMany({ where: { isActive: true } });
    for (const ws of workspaces) {
        const settings: WorkspaceSettings = {
            translationPrompt: ws.translationPrompt,
            hotScoreThreshold: ws.hotScoreThreshold,
            topicFilter: ws.topicFilter,
            maxPostAgeHours: ws.maxPostAgeHours,
        };
        for (const username of ws.targetAccounts) {
            const jobData: ScrapeJobData = {
                target: username,
                type: 'ACCOUNT',
                workspaceId: ws.id,
                settings,
                skipTranslation: false
            };
            await scrapeQueue.add("scrape-account", jobData, { jobId: `manual-${Date.now()}-${username}` });
            console.log(`  -> Enqueued @${username}`);
        }
    }
    await prisma.$disconnect();
    process.exit(0);
}
main().catch(console.error);
