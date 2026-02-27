import { prisma } from "./prisma";
import { createContainer, publishContainer, waitForContainer, refreshLongLivedToken } from "./threads_client";
import { stripPlatformReferences } from "./sanitizer";


export interface PublisherConfig {
    workspaceId: string;

    // Threads
    threadsUserId?: string;
    threadsAccessToken?: string;

    // Instagram
    instagramAccountId?: string;
    instagramAccessToken?: string;

    // Twitter
    twitterApiKey?: string;
    twitterApiSecret?: string;
    twitterAccessToken?: string;
    twitterAccessSecret?: string;

    translationPrompt: string;
    dailyLimit: number;
}


/**
 * Returns the number of ARTICLES published today for a given workspace.
 */
import { createInstagramContainer, publishInstagramContainer, waitForInstagramContainer, getInstagramMedia } from "./instagram_client";
import { uploadTwitterMedia, postTweet } from "./twitter_client";

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
 * Ensures the Threads token for a workspace is valid and not about to expire.
 * Refreshes if it expires in less than 7 days.
 */
export async function ensureValidThreadsToken(workspaceId: string): Promise<string | null> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId },
        select: { threadsToken: true, threadsExpiresAt: true }
    });

    if (!workspace || !workspace.threadsToken) return null;

    const nowSeconds = Math.floor(Date.now() / 1000);
    const sevenDaysSeconds = 7 * 24 * 60 * 60;

    // Refresh if expired or expiring within 7 days
    if (workspace.threadsExpiresAt && workspace.threadsExpiresAt < (nowSeconds + sevenDaysSeconds)) {
        try {
            console.log(`🔄 [Publisher] Refreshing Threads token for workspace ${workspaceId}...`);
            const refreshed = await refreshLongLivedToken(workspace.threadsToken);

            const newExpiresAt = Math.floor(Date.now() / 1000) + refreshed.expires_in;

            await prisma.workspace.update({
                where: { id: workspaceId },
                data: {
                    threadsToken: refreshed.access_token,
                    threadsExpiresAt: newExpiresAt
                }
            });

            console.log(`✅ [Publisher] Threads token refreshed. New expiry in ${Math.floor(refreshed.expires_in / 86400)} days.`);
            return refreshed.access_token;
        } catch (err: any) {
            console.error(`❌ [Publisher] Failed to refresh Threads token:`, err.message);
            // If refresh fails, we return the old one as a last resort (might still work if not fully expired)
            return workspace.threadsToken;
        }
    }

    return workspace.threadsToken;
}

// Per-workspace in-flight guard to prevent concurrent publish runs
const publishingInProgress = new Set<string>();

export interface PublishStats {
    publishedToday: number;
    dailyLimit: number;
    approvedReady: number;
    published: number;
    failed: number;
    platformResults?: Record<string, string>;
    reason?: string;
}

/**
 * Find and publish APPROVED synthesized articles for a workspace.
 */
export async function checkAndPublishApprovedPosts(config: PublisherConfig, maxPublish: number = 1): Promise<PublishStats> {
    const { workspaceId, dailyLimit } = config;

    const stats: PublishStats = {
        publishedToday: 0,
        dailyLimit,
        approvedReady: 0,
        published: 0,
        failed: 0,
        platformResults: {}
    };

    // Prevent concurrent publish runs for the same workspace (race-condition guard)
    if (publishingInProgress.has(workspaceId)) {
        console.log(`[Publisher] Publish already in progress for workspace ${workspaceId}. Skipping.`);
        stats.reason = "Publish already in progress.";
        return stats;
    }
    publishingInProgress.add(workspaceId);

    try {
        // Ensure token is valid before starting
        const validToken = await ensureValidThreadsToken(workspaceId);
        if (validToken) {
            config.threadsAccessToken = validToken;
        }

        console.log(`[Publisher] Checking workspace ${workspaceId} for APPROVED articles...`);

        const articlesToday = await getDailyPublishCount(workspaceId);
        stats.publishedToday = articlesToday;
        console.log(`[Publisher] Articles published today: ${articlesToday}/${dailyLimit}`);

        if (articlesToday >= dailyLimit) {
            console.log(`[Publisher] Daily limit reached. Skipping.`);
            stats.reason = `Daily limit reached (${articlesToday}/${dailyLimit}).`;
            return stats;
        }

        const remaining = dailyLimit - articlesToday;
        const toPublish = Math.min(remaining, maxPublish);

        if (toPublish <= 0) {
            stats.reason = "Daily limit check (remaining <= 0).";
            return stats;
        }

        const approvedArticles = await prisma.synthesizedArticle.findMany({
            where: {
                workspaceId,
                status: "APPROVED",
                OR: [
                    { scheduledPublishAt: null },
                    { scheduledPublishAt: { lte: new Date() } }
                ]
            },
            orderBy: { createdAt: "asc" },
            take: toPublish,
        });

        // Also count how many are ready in total (not just the 'take' batch)
        stats.approvedReady = await prisma.synthesizedArticle.count({
            where: {
                workspaceId,
                status: "APPROVED",
                OR: [
                    { scheduledPublishAt: null },
                    { scheduledPublishAt: { lte: new Date() } }
                ]
            }
        });

        if (approvedArticles.length === 0) {
            console.log(`[Publisher] No APPROVED articles ready to publish.`);
            stats.reason = "No articles with APPROVED status ready for scheduling.";
            return stats;
        }

        console.log(`[Publisher] Found ${approvedArticles.length} articles to publish.`);

        for (const article of approvedArticles) {
            try {
                await publishArticle(article, config);
                stats.published++;

                // Wait between posts to avoid rate limits
                console.log("[Publisher] Waiting 30 seconds before next post...");
                await new Promise(resolve => setTimeout(resolve, 30000));
            } catch (err) {
                console.error(`[Publisher] Failed to publish article ${article.id}:`, err);
                stats.failed++;

                await prisma.synthesizedArticle.update({
                    where: { id: article.id },
                    data: { status: "ERROR" },
                });
            }
        }
        return stats;
    } finally {
        publishingInProgress.delete(workspaceId);
    }
}


export async function publishArticle(
    article: {
        id: string;
        articleContent: string;
        sourcePostIds: string[];
        selectedMediaUrl?: string | null;
        selectedMediaType?: string | null;
    },
    config: PublisherConfig
) {
    let rawText = article.articleContent;
    let text = stripPlatformReferences(rawText);

    // Determine media
    let mediaUrl = "";
    let coverUrl = "";
    let mediaType: "IMAGE" | "VIDEO" | "TEXT" = "TEXT";

    // 1. User selected media (Priority)
    if (article.selectedMediaUrl) {
        mediaUrl = article.selectedMediaUrl;
        const rawType = article.selectedMediaType?.toUpperCase();
        mediaType = (rawType === "VIDEO") ? "VIDEO" : "IMAGE";

        console.log(`[Publisher] Using user-selected media: ${mediaType} - ${mediaUrl}`);
    }
    // 2. Auto-pick from source posts (Fallback)
    else if (article.sourcePostIds.length > 0) {
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
                    }
                }
            }
            if (mediaType === "VIDEO") break; // Found video, stop looking
        }
        console.log(`[Publisher] Auto-selected media: ${mediaType} - ${mediaUrl}`);
    }

    if (!mediaUrl && !text) {
        console.log(`[Publisher] Article ${article.id}: No text or media, skipping.`);
        return;
    }

    const results: Record<string, string | null> = {
        threads: null,
        instagram: null,
        twitter: null
    };

    const dates: Record<string, Date | null> = {
        instagram: null,
        twitter: null
    };

    // --- THREADS ---
    if (config.threadsUserId && config.threadsAccessToken) {
        try {
            console.log(`[Publisher] Publishing to Threads...`);

            // Threads has a 500-character limit
            let threadsText = text;
            if (threadsText && threadsText.length > 500) {
                console.log(`[Publisher] Truncating Threads content (original length: ${threadsText.length})`);
                threadsText = threadsText.substring(0, 497) + "...";
            }

            const containerId = await createContainer(
                config.threadsUserId,
                config.threadsAccessToken,
                mediaType, // Pass the actual detected type (TEXT, IMAGE, or VIDEO)
                mediaUrl || undefined,
                threadsText || undefined,
                undefined,
                undefined,
                coverUrl || undefined
            );

            if (mediaType === "VIDEO") {
                await waitForContainer(containerId, config.threadsAccessToken);
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            const publishedId = await publishContainer(config.threadsUserId, config.threadsAccessToken, containerId);

            // Fetch the actual permalink
            let threadsUrl = `https://www.threads.net/post/${publishedId}`;
            try {
                const { getThread } = await import("./threads_client");
                const threadDetails = await getThread(publishedId, config.threadsAccessToken);
                if (threadDetails.permalink) threadsUrl = threadDetails.permalink;
            } catch (e) { }

            results.threads = threadsUrl;
            results.threads_id = publishedId;
            console.log(`[Publisher] Threads success: ${threadsUrl}`);
        } catch (e: any) {
            console.error(`[Publisher] Threads failed:`, e.message);
        }
    }

    // --- INSTAGRAM ---
    if (config.instagramAccountId && config.instagramAccessToken && mediaUrl) {
        try {
            console.log(`[Publisher] Publishing to Instagram...`);
            // IG requires unique media logic usually, but reuse createInstagramContainer
            // Note: IG usually requires strict aspect ratios.
            const igContainerId = await createInstagramContainer(
                config.instagramAccountId,
                config.instagramAccessToken,
                mediaType === "VIDEO" ? 'VIDEO' : 'IMAGE',
                mediaUrl,
                text, // Cleaned caption
                undefined,
                undefined,
                coverUrl
            );

            if (mediaType === "VIDEO") {
                await waitForInstagramContainer(igContainerId, config.instagramAccessToken);
            } else {
                await new Promise(resolve => setTimeout(resolve, 5000));
            }

            const publishedId = await publishInstagramContainer(config.instagramAccountId, config.instagramAccessToken, igContainerId);

            // Get permalink
            let igUrl = `https://www.instagram.com/p/${publishedId}/`;
            try {
                const details = await getInstagramMedia(publishedId, config.instagramAccessToken);
                if (details.permalink) igUrl = details.permalink;
            } catch (e) { }

            results.instagram = igUrl;
            dates.instagram = new Date();
            console.log(`[Publisher] Instagram success: ${igUrl}`);

        } catch (e: any) {
            console.error(`[Publisher] Instagram failed:`, e.message);
        }
    }

    // --- TWITTER ---
    // Check for either OAuth 1.0 (Legacy) or OAuth 2.0 (Bearer)
    const hasTwitterV1 = config.twitterApiKey && config.twitterApiSecret && config.twitterAccessToken && config.twitterAccessSecret;
    // For OAuth 2.0, we just need the access token (bearer). We don't check for accessSecret existence to allow mixed but valid states, 
    // but typically it will be missing. Key is we have an accessToken.
    const hasTwitterV2 = !!config.twitterAccessToken;

    if (hasTwitterV1 || hasTwitterV2) {
        try {
            console.log(`[Publisher] Publishing to X (Twitter)...`);

            // Construct config based on available credentials
            const twitterConfig: any = {
                accessToken: config.twitterAccessToken!,
            };

            if (hasTwitterV1) {
                twitterConfig.appKey = config.twitterApiKey!;
                twitterConfig.appSecret = config.twitterApiSecret!;
                twitterConfig.accessSecret = config.twitterAccessSecret!;
            }

            let mediaIds: string[] = [];

            // Twitter V2 Media Upload requires OAuth 1.0a (User Context) usually
            if (mediaUrl) {
                if (hasTwitterV1) {
                    try {
                        const mediaId = await uploadTwitterMedia(
                            twitterConfig,
                            mediaUrl,
                            mediaType === 'VIDEO' ? 'video' : 'image'
                        );
                        mediaIds.push(mediaId);
                    } catch (uploadErr: any) {
                        console.warn(`[Publisher] Twitter media upload failed (likely permission/format): ${uploadErr.message}. Proceeding with text only.`);
                    }
                } else {
                    console.warn(`[Publisher] Twitter media upload skipped: Missing OAuth 1.0a credentials. Posting text only.`);
                }
            }

            const tweet = await postTweet(twitterConfig, text, mediaIds);
            const twitterUrl = `https://twitter.com/user/status/${tweet.id}`;
            results.twitter = twitterUrl;
            dates.twitter = new Date();
            console.log(`[Publisher] Twitter success: ${twitterUrl}`);

        } catch (e: any) {
            console.error(`[Publisher] Twitter failed:`, e.message);
        }
    }

    // Determine final status
    // If at least one succeeded, we consider it PUBLISHED (but maybe partial)
    const anySuccess = results.threads || results.instagram || results.twitter;

    if (anySuccess) {
        await (prisma as any).synthesizedArticle.update({
            where: { id: article.id },
            data: {
                status: "PUBLISHED",
                publishedUrl: results.threads, // Main URL still Threads
                publishedUrlInstagram: results.instagram,
                publishedUrlTwitter: results.twitter,
                publishedAtInstagram: dates.instagram,
                publishedAtTwitter: dates.twitter,
                publishedAt: new Date(),
                threadsMediaId: results.threads_id, // Store the raw media ID for metrics
            },
        });
    } else {
        throw new Error("Failed to publish to any configured platform.");
    }
}