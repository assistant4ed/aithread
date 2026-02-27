import { prisma } from "../lib/prisma";
import { deleteBlobFromStorage } from "../lib/storage";

async function dryRunPruning() {
    console.log("[DryRun] Checking for posts older than 30 days...");
    const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000);

    const posts = await prisma.post.findMany({
        where: { createdAt: { lt: thirtyDaysAgo } },
        select: { id: true, mediaUrls: true, createdAt: true }
    });

    if (posts.length === 0) {
        console.log("[DryRun] No old posts found to prune.");
        return;
    }

    console.log(`[DryRun] Would prune ${posts.length} posts.`);

    for (const post of posts) {
        console.log(`  - Post ${post.id} created at ${post.createdAt.toISOString()}`);
        const media = post.mediaUrls as any[];
        if (media && Array.isArray(media)) {
            for (const item of media) {
                if (item.url && item.url.includes(".blob.core.windows.net")) {
                    const filename = item.url.split("/").pop();
                    console.log(`    - Would delete blob: ${filename}`);
                }
            }
        }
    }
}

dryRunPruning()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
