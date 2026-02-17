import { prisma } from "./prisma";
import { createContainer, publishContainer, waitForContainer } from "./threads_client";
import { translateContent } from "./processor";

export interface PublisherConfig {
    workspaceId: string;
    threadsUserId: string;
    threadsAccessToken: string;
    translationPrompt: string;
    dailyLimit: number;
}

/**
 * Returns the number of posts published today for a given workspace.
 */
export async function getDailyPublishCount(workspaceId: string): Promise<number> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    return prisma.post.count({
        where: {
            workspaceId,
            status: "PUBLISHED",
            publishedAt: { gte: todayStart },
        },
    });
}

/**
 * Find and publish all APPROVED posts for a workspace.
 */
export async function checkAndPublishApprovedPosts(config: PublisherConfig) {
    const { workspaceId, threadsUserId, threadsAccessToken, translationPrompt, dailyLimit } = config;

    console.log(`[Publisher] Checking workspace ${workspaceId} for APPROVED posts...`);

    const postsToday = await getDailyPublishCount(workspaceId);
    console.log(`[Publisher] Posts published today: ${postsToday}/${dailyLimit}`);

    if (postsToday >= dailyLimit) {
        console.log(`[Publisher] Daily limit reached. Skipping.`);
        return;
    }

    const remaining = dailyLimit - postsToday;

    const approvedPosts = await prisma.post.findMany({
        where: {
            workspaceId,
            status: "APPROVED",
        },
        orderBy: { createdAt: "asc" },
        take: remaining,
    });

    if (approvedPosts.length === 0) {
        console.log(`[Publisher] No APPROVED posts found.`);
        return;
    }

    console.log(`[Publisher] Found ${approvedPosts.length} posts to publish.`);

    for (const post of approvedPosts) {
        try {
            await publishPost(post, threadsUserId, threadsAccessToken, translationPrompt);

            // Wait between posts to avoid rate limits
            console.log("[Publisher] Waiting 30 seconds before next post...");
            await new Promise(resolve => setTimeout(resolve, 30000));
        } catch (err) {
            console.error(`[Publisher] Failed to publish post ${post.id}:`, err);
            await prisma.post.update({
                where: { id: post.id },
                data: { status: "ERROR" },
            });
        }
    }
}

async function publishPost(
    post: { id: string; contentOriginal: string | null; contentTranslated: string | null; mediaUrls: any; sourceAccount: string },
    threadsUserId: string,
    threadsAccessToken: string,
    translationPrompt: string
) {
    let text = post.contentTranslated;

    // Auto-translate if missing
    if (!text && post.contentOriginal) {
        console.log(`[Publisher] Post ${post.id}: Missing translation. Generating now...`);
        text = await translateContent(post.contentOriginal, translationPrompt);
        await prisma.post.update({
            where: { id: post.id },
            data: { contentTranslated: text },
        });
    }

    // Add credit
    if (text && post.sourceAccount) {
        text += `\n\nCredit: @${post.sourceAccount}`;
    }

    // Determine media
    let mediaUrl = "";
    let mediaType: "IMAGE" | "VIDEO" | "TEXT" = "TEXT";

    if (post.mediaUrls) {
        const mediaItems = Array.isArray(post.mediaUrls) ? post.mediaUrls : [];
        if (mediaItems.length > 0) {
            const firstItem = mediaItems[0];
            mediaUrl = typeof firstItem === "string" ? firstItem : firstItem.url;
            const itemType = typeof firstItem === "string" ? "image" : firstItem.type;

            if (itemType === "video" || mediaUrl.toLowerCase().includes(".mp4")) {
                mediaType = "VIDEO";
            } else {
                mediaType = "IMAGE";
            }
        }
    }

    if (!mediaUrl && !text) {
        console.log(`[Publisher] Post ${post.id}: No text or media, skipping.`);
        return;
    }

    // Create container
    console.log(`[Publisher] Creating Threads container (${mediaType})...`);
    const containerId = await createContainer(
        threadsUserId,
        threadsAccessToken,
        mediaType,
        mediaUrl || undefined,
        text || undefined
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
    await prisma.post.update({
        where: { id: post.id },
        data: {
            status: "PUBLISHED",
            publishedUrl: threadsUrl,
            publishedAt: new Date(),
        },
    });
}