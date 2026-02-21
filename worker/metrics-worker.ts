import "dotenv/config";
import { prisma } from "../lib/prisma";
import { getThreadsMetrics } from "../lib/threads_client";
import { ensureValidThreadsToken } from "../lib/publisher_service";

/**
 * PERIODIC WORKER: Updates performance metrics for PUBLISHED articles.
 * Runs on a schedule or manual trigger.
 */
async function updateAllPublishedMetrics() {
    console.log("=== Refreshing Post Metrics ===");

    // Fetch articles published in the last 7 days that are active
    const lookbackDate = new Date();
    lookbackDate.setDate(lookbackDate.getDate() - 7);

    const articles = await (prisma as any).synthesizedArticle.findMany({
        where: {
            status: "PUBLISHED",
            publishedAt: { gte: lookbackDate } as any,
            threadsMediaId: { not: null } as any
        },
        include: {
            workspace: {
                select: { id: true, threadsToken: true, threadsAppId: true }
            }
        }
    });

    console.log(`[Metrics] Found ${articles.length} articles to check.`);

    for (const article of articles) {
        if (!article.threadsMediaId) continue;

        try {
            // Ensure we have a valid token (refresh if needed)
            const token = await ensureValidThreadsToken(article.workspaceId);
            if (!token) {
                console.warn(`[Metrics] Skipping article ${article.id}: No valid token for workspace ${article.workspaceId}`);
                continue;
            }

            console.log(`[Metrics] Fetching for "${article.topicName.slice(0, 30)}..." (${article.threadsMediaId})`);

            const metrics = await getThreadsMetrics(article.threadsMediaId, token);

            await (prisma as any).synthesizedArticle.update({
                where: { id: article.id },
                data: {
                    views: metrics.views,
                    likes: metrics.likes,
                    replies: metrics.replies,
                    reposts: metrics.reposts,
                    lastMetricsUpdate: new Date()
                }
            });

            console.log(`[Metrics] ✅ Updated: V:${metrics.views} L:${metrics.likes} R:${metrics.replies} RP:${metrics.reposts}`);

            // Wait slightly between requests
            await new Promise(r => setTimeout(r, 1000));

        } catch (err: any) {
            console.error(`[Metrics] ❌ Failed for article ${article.id}:`, err.message);
        }
    }

    console.log("=== Metrics Refresh Completed ===");
}

// Simple loop or manual run
if (require.main === module) {
    (async () => {
        while (true) {
            try {
                await updateAllPublishedMetrics();
            } catch (e) {
                console.error("Critical error in metrics worker:", e);
            }
            console.log("Waiting 60 minutes for next refresh...");
            await new Promise(r => setTimeout(r, 60 * 60 * 1000));
        }
    })();
}

export { updateAllPublishedMetrics };
