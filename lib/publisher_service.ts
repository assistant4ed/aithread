import { prisma } from "./prisma";
import { createContainer, publishContainer, waitForContainer } from "./threads_client";


export interface PublisherConfig {
    workspaceId: string;
    threadsUserId: string;
    threadsAccessToken: string;
    translationPrompt: string;
    dailyLimit: number;
}


/**
 * Returns the number of ARTICLES published today for a given workspace.
 */
export async function getDailyPublishCount(workspaceId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return prisma.synthesizedArticle.count({
        where: {
            workspaceId,
            status: "PUBLISHED",
            publishedAt: { gte: todayStart },
        },
    });
}

/**
 * Find and publish APPROVED synthesized articles for a workspace.
 */
export async function checkAndPublishApprovedPosts(config: PublisherConfig) {
    const { workspaceId, threadsUserId, threadsAccessToken, dailyLimit } = config;

    console.log(`[Publisher] Checking workspace ${workspaceId} for APPROVED articles...`);

    const articlesToday = await getDailyPublishCount(workspaceId);
    console.log(`[Publisher] Articles published today: ${articlesToday}/${dailyLimit}`);

    if (articlesToday >= dailyLimit) {
        console.log(`[Publisher] Daily limit reached. Skipping.`);
        return;
    }

    const remaining = dailyLimit - articlesToday;

    const approvedArticles = await prisma.synthesizedArticle.findMany({
        where: {
            workspaceId,
            status: "APPROVED",
        },
        orderBy: { createdAt: "asc" },
        take: remaining,
    });

    if (approvedArticles.length === 0) {
        console.log(`[Publisher] No APPROVED articles found.`);
        return;
    }

    console.log(`[Publisher] Found ${approvedArticles.length} articles to publish.`);

    for (const article of approvedArticles) {
        try {
            await publishArticle(article, threadsUserId, threadsAccessToken);

            // Wait between posts to avoid rate limits
            console.log("[Publisher] Waiting 30 seconds before next post...");
            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (err) {
            console.error(`[Publisher] Failed to publish article ${article.id}:`, err);
            await prisma.synthesizedArticle.update({
                where: { id: article.id },
                data: { status: "ERROR" },
            });
        }
    }
}

export async function publishArticle(
    article: { id: string; articleContent: string; sourcePostIds: string[] },
    threadsUserId: string,
    threadsAccessToken: string
) {
    let text = article.articleContent;

    // Determine media from source posts
    let mediaUrl = "";
    let coverUrl = "";
    let mediaType: "IMAGE" | "VIDEO" | "TEXT" = "TEXT";

    if (article.sourcePostIds.length > 0) {
        const sourcePosts = await prisma.post.findMany({
            where: { id: { in: article.sourcePostIds } },
            select: { mediaUrls: true }
        });


        // Find first valid media
        for (const post of sourcePosts) {
            if (post.mediaUrls && Array.isArray(post.mediaUrls)) {
                for (const item of post.mediaUrls) {
                    if (!item) continue;
                    const mediaItem = item as any;
                    const url = typeof mediaItem === "string" ? mediaItem : mediaItem.url;
                    const type = typeof mediaItem === "string" ? "image" : mediaItem.type;
                    const itemCover = typeof mediaItem === "string" ? undefined : mediaItem.coverUrl;

                    if (!url) continue;

                    if (type === "video" || url.toLowerCase().includes(".mp4")) {
                        mediaUrl = url;
                        coverUrl = itemCover || "";
                        mediaType = "VIDEO";
                        break; // Prefer video
                    } else if (!mediaUrl) {
                        mediaUrl = url;
                        mediaType = "IMAGE";
                    }
                }
            }
            if (mediaType === "VIDEO") break; // Found video, stop looking
        }
    }

    if (!mediaUrl && !text) {
        console.log(`[Publisher] Article ${article.id}: No text or media, skipping.`);
        return;
    }

    // Create container
    console.log(`[Publisher] Creating Threads container (${mediaType})...`);
    console.log(`[Publisher] Media URL: ${mediaUrl}`);
    if (coverUrl) console.log(`[Publisher] Cover URL: ${coverUrl}`);

    const containerId = await createContainer(
        threadsUserId,
        threadsAccessToken,
        mediaType,
        mediaUrl || undefined,
        text || undefined,
        undefined, // children
        undefined, // isCarouselItem
        coverUrl || undefined
    );

    console.log(`[Publisher] Container ID: ${containerId}`);

    // Wait for processing
    if (mediaType === "VIDEO") {
        console.log("[Publisher] Waiting for video container to finish processing...");
        await waitForContainer(containerId, threadsAccessToken);
    } else {
        console.log("[Publisher] Waiting 10 seconds for container to be ready...");
        await new Promise(resolve => setTimeout(resolve, 10000));
    }

    // Publish
    console.log(`[Publisher] Publishing container ${containerId}...`);
    const publishedId = await publishContainer(threadsUserId, threadsAccessToken, containerId);
    const threadsUrl = `https://www.threads.net/post/${publishedId}`;

    console.log(`[Publisher] Published! URL: ${threadsUrl}`);

    // Update DB
    await prisma.synthesizedArticle.update({
        where: { id: article.id },
        data: {
            status: "PUBLISHED",
            publishedUrl: threadsUrl,
            publishedAt: new Date(),
        },
    });
}