import { prisma } from "./lib/prisma";
import { scrapeQueue } from "./lib/queue";

async function triggerTestScrape(workspaceName: string, targetAccount: string) {
    const ws = await prisma.workspace.findUnique({
        where: { name: workspaceName },
    });

    if (!ws) {
        console.error(`Workspace ${workspaceName} not found`);
        process.exit(1);
    }

    console.log(`[Test] Triggering scrape for @${targetAccount} in workspace ${ws.name}...`);

    const job = await scrapeQueue.add(`test-scrape-${Date.now()}`, {
        target: targetAccount,
        type: 'ACCOUNT',
        workspaceId: ws.id,
        settings: {
            hotScoreThreshold: ws.hotScoreThreshold,
            maxPostAgeHours: ws.maxPostAgeHours,
        },
        skipTranslation: false,
    });

    console.log(`[Test] Job enqueued! ID: ${job.id}`);
    console.log(`[Test] Now monitor Azure Container App replicas for 'worker-scraper-sg'.`);
}

// Using 'blueapex' as it's the active workspace we've been working with
// Scraping a known active account to ensure results
triggerTestScrape("Blueapex", "zuck").catch(console.error);
