import 'dotenv/config';
import { prisma } from "../lib/prisma";
import { publishArticle } from "../lib/publisher_service";
import { ThreadsScraper } from "../lib/scraper";
import { uploadMediaToGCS } from "../lib/storage";

async function main() {
    const args = process.argv.slice(2);
    const targetArticleId = args[0];

    console.log("=== Standalone Publisher Runtime ===");

    if (targetArticleId) {
        console.log(`[Manual] Attempting to publish specific article: ${targetArticleId}`);
        const article = await prisma.synthesizedArticle.findUnique({
            where: { id: targetArticleId }
        });

        if (!article) {
            console.error("[Error] Article not found.");
            process.exit(1);
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: article.workspaceId }
        });

        if (!workspace || !workspace.threadsAppId || !workspace.threadsToken) {
            console.error("[Error] Workspace credentials missing.");
            process.exit(1);
        }

        await enrichAndPublish(article, workspace);
    } else {
        console.log("[Auto] Checking all workspaces for APPROVED articles...");
        const workspaces = await prisma.workspace.findMany();

        for (const ws of workspaces) {
            if (!ws.threadsAppId || !ws.threadsToken) continue;

            const approvedArticles = await prisma.synthesizedArticle.findMany({
                where: {
                    workspaceId: ws.id,
                    status: "APPROVED"
                }
            });

            console.log(`[Workspace ${ws.name}] Found ${approvedArticles.length} approved articles.`);

            for (const article of approvedArticles) {
                try {
                    await enrichAndPublish(article, ws);
                } catch (e) {
                    console.error(`[Error] Failed to publish ${article.id}:`, e);
                }
            }
        }
    }


    console.log("=== Done ===");
    process.exit(0);
}

/**
 * Checks if the article's source posts need media enrichment (missing cover or bad video URL)
 * before calling the standard publishArticle function.
 */
async function enrichAndPublish(article: any, workspace: any) {
    console.log(`[Process] Article: ${article.id} (${article.topicName})`);

    const sourcePosts = await prisma.post.findMany({
        where: { id: { in: article.sourcePostIds } }
    });

    let needsEnrichment = false;
    for (const post of sourcePosts) {
        const media = (post.mediaUrls as any[]) || [];
        const hasVideo = media.some(m => m.type === 'video');
        const missingCover = media.some(m => m.type === 'video' && !m.coverUrl);
        const hasDash = media.some(m => m.url && m.url.includes('dash_baseline'));

        if (hasVideo && (missingCover || hasDash)) {
            needsEnrichment = true;
            console.log(`[Enrichment] Post ${post.id} needs fixing (Has Video: ${hasVideo}, Missing Cover: ${missingCover}, Bad URL: ${hasDash})`);
        }
    }

    if (needsEnrichment) {
        console.log(`[Enrichment] Starting Puppeteer to fix source posts...`);
        const scraper = new ThreadsScraper();
        await scraper.init();

        try {
            for (const post of sourcePosts) {
                const media = (post.mediaUrls as any[]) || [];
                const isBadVideo = media.some(m => m.type === 'video' && (!m.coverUrl || m.url.includes('dash_baseline')));

                if (isBadVideo && post.sourceUrl) {
                    const pageUrl = post.sourceUrl.replace('threads.com', 'threads.net');
                    const enriched = await scraper.enrichPost(pageUrl);

                    if (enriched && enriched.videoUrl) {
                        console.log(`[Enrichment]   -> Post ${post.id}: Found HQ Video + Cover`);

                        // Upload to GCS
                        const videoGcs = await uploadMediaToGCS(enriched.videoUrl, `enriched/${Date.now()}_${post.id}.mp4`);
                        let coverGcs = undefined;
                        if (enriched.coverUrl) {
                            coverGcs = await uploadMediaToGCS(enriched.coverUrl, `enriched/${Date.now()}_${post.id}_cover.jpg`);
                        }

                        // Update DB
                        const updatedMedia = media.map(m => {
                            if (m.type === 'video') {
                                return { ...m, url: videoGcs, coverUrl: coverGcs };
                            }
                            return m;
                        });

                        await prisma.post.update({
                            where: { id: post.id },
                            data: { mediaUrls: updatedMedia }
                        });
                        console.log(`[Enrichment]   -> DB updated for post ${post.id}`);
                    }
                }
            }
        } finally {
            await scraper.close();
        }
    }

    // Now call the standard publisher
    console.log(`[Publish] Invoking publisher_service...`);
    await publishArticle(article, workspace.threadsAppId, workspace.threadsToken);
}


main().catch(err => {
    console.error(err);
    process.exit(1);
});
