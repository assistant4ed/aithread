import { prisma } from "./prisma";
import { getProvider, FallbackProvider } from "./ai/provider";
import { calculateTopicScore, applyFreshnessAdjustment } from "./scoring/topicScore";
import { ThreadPost, ThreadsScraper } from "./scraper";

export interface WorkspaceSettings {
    translationPrompt: string;
    hotScoreThreshold: number;
    topicFilter?: string | null;
    maxPostAgeHours?: number;
    aiProvider?: string;
    aiModel?: string;
    aiApiKey?: string | null;
}

export interface ProcessPostOptions {
    skipTranslation?: boolean;
}

/**
 * Centrally resolve AI provider based on workspace settings with consistent defaults.
 */
function getWorkspaceProvider(settings?: WorkspaceSettings, modelOverride?: string, providerOverride?: string) {
    const primaryProviderName = (providerOverride || settings?.aiProvider || "GROQ").toUpperCase();
    const primaryModel = modelOverride || settings?.aiModel || "llama-3.3-70b-versatile";

    const primary = getProvider({
        provider: primaryProviderName,
        model: primaryModel,
        apiKey: settings?.aiApiKey || undefined,
    });

    // Build fallback chain: Primary → GROQ (if not already) → Gemini (geo-safe)
    const fallbacks: import("./ai/provider").AIProvider[] = [primary];

    if (primaryProviderName !== "GROQ") {
        fallbacks.push(getProvider({
            provider: "GROQ",
            model: "llama-3.3-70b-versatile",
        }));
    }

    // Always add Gemini as the last-resort fallback (works from all regions incl. HK)
    if (primaryProviderName !== "GEMINI") {
        fallbacks.push(getProvider({
            provider: "GEMINI",
            model: "gemini-2.5-flash",
        }));
    }

    return fallbacks.length > 1 ? new FallbackProvider(fallbacks) : primary;
}

function safeDate(d: any): Date | undefined {
    if (!d) return undefined;
    const date = new Date(d);
    return isNaN(date.getTime()) ? undefined : date;
}

export function isLikelySpam(input: { content: string | null; followerCount: number | null }): boolean {
    if (!input.content) return true;
    const content = input.content.toLowerCase();

    // Low quality patterns
    const spamPatterns = [
        "check out my bio",
        "link in bio",
        "make money fast",
        "dm for collab",
        "follow for follow",
        "subscribe to my",
        "🔥💰🚀"
    ];

    if (spamPatterns.some(p => content.includes(p))) return true;

    // Zero follower accounts with very short repetitive content
    if ((input.followerCount === 0 || input.followerCount === null) && content.length < 20) {
        return true;
    }

    return false;
}

const FOLLOWER_CACHE_TTL_HOURS = 24;

export async function resolveFollowerCounts(
    posts: ThreadPost[],
    scraper: ThreadsScraper
): Promise<Map<string, number>> {
    const authorIds = [...new Set(posts.map(p => p.authorId))].filter(Boolean);
    const followerMap = new Map<string, number>();

    // Batch fetch from cache first
    const cached = await prisma.accountCache.findMany({
        where: {
            platformId: { in: authorIds },
            platform: 'THREADS',
            updatedAt: { gte: new Date(Date.now() - FOLLOWER_CACHE_TTL_HOURS * 3600000) }
        }
    });

    cached.forEach((c: any) => followerMap.set(c.platformId, c.followerCount));

    // Identify accounts needing resolution
    const uncachedIds = authorIds.filter(id => !followerMap.has(id));

    if (uncachedIds.length > 0) {
        // Batch resolve in chunks — don't hammer the API
        const chunkSize = 5;
        for (let i = 0; i < uncachedIds.length; i += chunkSize) {
            const currentChunk = uncachedIds.slice(i, i + chunkSize);
            const resolved = await scraper.batchFetchFollowerCounts(currentChunk);

            // Write to cache
            await prisma.accountCache.createMany({
                data: resolved.map(r => ({
                    platformId: r.id,
                    followerCount: r.followerCount,
                    platform: 'THREADS',
                    updatedAt: new Date()
                })),
                skipDuplicates: true,
            });

            resolved.forEach((r: any) => followerMap.set(r.id, r.followerCount));
            await new Promise(r => setTimeout(r, 1000)); // rate limit between batches
        }
    }

    return followerMap;
}

export type RejectionReason = 'freshness' | 'engagement' | 'duplicate' | 'spam' | 'no_date';

/**
 * Process a scraped post: check for duplicates, score, translate if hot, and save.
 * Returns the saved post if new, or a { rejected: reason } object explaining why it was skipped.
 */
export async function processPost(
    postData: {
        threadId: string;
        content: string;
        mediaUrls: { url: string; type: string; coverUrl?: string }[];
        views: number;
        likes: number;
        replies: number;
        reposts: number;
        postedAt?: Date;
        postUrl: string;
        externalUrls: string[];
    },
    sourceAccount: string,
    workspaceId: string,
    settings: WorkspaceSettings,
    options: ProcessPostOptions = {},
    followerCount: number = 0,
    source?: {
        type: 'ACCOUNT' | 'TOPIC';
        minLikes?: number | null;
        minReplies?: number | null;
        maxAgeHours?: number | null;
        trustWeight?: number;
    }
) {
    const validPostedAt = safeDate(postData.postedAt);

    // 1. Freshness gate — reject posts with no date (prevents ageHours=0 bypass)
    if (!validPostedAt) {
        console.log(`[Processor] Skipping post ${postData.threadId} with no valid date`);
        return { rejected: 'no_date' as RejectionReason };
    }

    const ageHours = (Date.now() - validPostedAt.getTime()) / (1000 * 60 * 60);

    if (source?.type === 'ACCOUNT') {
        // Accounts keep hard gate
        if (settings.maxPostAgeHours && ageHours > settings.maxPostAgeHours) {
            console.log(`[Processor] Skipping outdated account post ${postData.threadId} (${ageHours.toFixed(0)}h old, limit: ${settings.maxPostAgeHours}h)`);
            return { rejected: 'freshness' as RejectionReason };
        }
    } else if (source?.type === 'TOPIC') {
        // Topics use sliding penalty (implemented in scoring step below)
        // We only apply a hard cutoff at 72h as a safety measure
        if (ageHours > 72) {
            console.log(`[Processor] Skipping very old topic post ${postData.threadId} (${ageHours.toFixed(0)}h old)`);
            return { rejected: 'freshness' as RejectionReason };
        }
    } else if (settings.maxPostAgeHours && ageHours > settings.maxPostAgeHours) {
        // Fallback for unknown source types
        console.log(`[Processor] Skipping outdated post ${postData.threadId} (${ageHours.toFixed(0)}h old)`);
        return { rejected: 'freshness' as RejectionReason };
    }

    // 2. Check if post exists
    const existing = await prisma.post.findUnique({
        where: { threadId_workspaceId: { threadId: postData.threadId, workspaceId } },
    });

    if (existing) {
        // Update engagement stats
        const newScore = calculateHotScore({ ...postData, postedAt: validPostedAt, followerCount });
        await prisma.post.update({
            where: { id: existing.id },
            data: {
                likes: postData.likes,
                replies: postData.replies,
                reposts: postData.reposts,
                hotScore: isNaN(newScore) ? 0 : newScore,
            },
        });
        return { rejected: 'duplicate' as RejectionReason }; // Not new
    }

    // 3. Topic Filter Check (Legacy settings filter)
    if (settings.topicFilter && postData.content) {
        const isRelevant = await checkTopicRelevance(postData.content, settings.topicFilter, settings);
        if (!isRelevant) {
            console.log(`[Processor] Post rejected by topic filter: "${settings.topicFilter}"`);
            return { rejected: 'engagement' as RejectionReason };
        }
    }

    // 4. Score & Quality Gates
    let finalScore: number;
    let passesGate = true;

    if (source?.type === 'TOPIC') {
        // Topic-specific spam filter (heuristic)
        if (isLikelySpam({ content: postData.content, followerCount })) {
            console.log(`[Processor] Topic post ${postData.threadId} rejected by spam filter heuristics.`);
            return { rejected: 'spam' as RejectionReason };
        }

        const scoreResult = calculateTopicScore({
            likeCount: postData.likes,
            replyCount: postData.replies,
            repostCount: postData.reposts,
            quoteCount: 0, // Not currently scraped
            followerCount: followerCount || null,
            ageHours
        });

        // Apply sliding freshness penalty
        finalScore = applyFreshnessAdjustment(scoreResult.score, ageHours);

        // Use the tier-based gate result, but we also respect the freshness adjustment (if it returned 0)
        passesGate = scoreResult.passesGate && finalScore > 0;

        // Apply workspace hotScoreThreshold if defined
        if (settings.hotScoreThreshold && finalScore < settings.hotScoreThreshold) {
            passesGate = false;
        }

        if (!passesGate) {
            console.log(`[Processor] Topic post ${postData.threadId} rejected: score ${finalScore.toFixed(1)} (${scoreResult.tier} tier)`);
            return { rejected: 'engagement' as RejectionReason };
        }

        console.log(`[Processor] Topic post ${postData.threadId} accepted: score ${finalScore.toFixed(1)} (${scoreResult.tier} tier)`);
    } else {
        // Account-based scoring
        const score = calculateHotScore({ ...postData, postedAt: validPostedAt, followerCount });
        finalScore = isNaN(score) ? 0 : (score * (source?.trustWeight || 1.0));

        // 5. Hot score gate — skip low-engagement posts
        const ingestThreshold = settings.hotScoreThreshold || 10;
        if (finalScore < ingestThreshold) {
            console.log(`[Processor] Skipping low-score post ${postData.threadId} (score: ${finalScore.toFixed(1)}, threshold: ${ingestThreshold})`);
            return { rejected: 'engagement' as RejectionReason };
        }
    }

    // 6. Save
    const savedPost = await (prisma.post as any).create({
        data: {
            threadId: postData.threadId,
            sourceAccount,
            contentOriginal: postData.content,
            contentTranslated: null,
            mediaUrls: postData.mediaUrls,
            views: postData.views,
            likes: postData.likes,
            replies: postData.replies,
            reposts: postData.reposts,
            hotScore: finalScore,
            sourceUrl: postData.postUrl,
            externalUrls: postData.externalUrls || [],
            postedAt: validPostedAt || null,
            status: "PENDING_REVIEW",
            workspaceId,
            sourceId: (source as any)?.id,
            sourceType: source?.type || "ACCOUNT",
        },
    });

    return savedPost;
}

// calculateTopicHotScore removed in favor of topicScore.ts

/**
 * Calculate hot score with time-decay.
 *
 * PRIMARY signal: breakout ratio = views ÷ followerCount × 100
 *   e.g. 2000 views / 500 followers = 4.0 → score = 400
 *   This rewards posts that punched above the account's normal reach.
 *
 * FALLBACK (when views or followerCount = 0):
 *   Legacy engagement score = likes×1.5 + replies×2 + reposts×1
 *
 * Decay: score halves every 24 hours since posting.
 */
export function calculateHotScore(post: {
    views?: number;
    likes: number;
    replies: number;
    reposts: number;
    followerCount?: number;
    postedAt?: Date;
}): number {
    let baseScore: number;

    if (post.views && post.views > 0 && post.followerCount && post.followerCount > 0) {
        // Breakout ratio — primary signal
        const breakoutRatio = post.views / post.followerCount;
        baseScore = breakoutRatio * 100;
        console.log(`[HotScore] Breakout ratio: ${post.views} views / ${post.followerCount} followers = ${breakoutRatio.toFixed(2)} → score ${baseScore.toFixed(0)}`);
    } else {
        // Legacy fallback
        baseScore = (post.likes * 1.5) + (post.replies * 2) + (post.reposts * 1);
    }

    const validDate = safeDate(post.postedAt);
    if (!validDate) return baseScore;

    const ageHours = (Date.now() - validDate.getTime()) / (1000 * 60 * 60);
    const decayFactor = Math.pow(0.5, ageHours / 72); // Half-life = 72 hours (3 days)
    const result = baseScore * decayFactor;
    return isNaN(result) ? baseScore : result;
}

export async function checkTopicRelevance(content: string, topic: string, aiSettings?: WorkspaceSettings): Promise<boolean> {
    const provider = getWorkspaceProvider(aiSettings, "llama-3.1-8b-instant");

    try {
        const answer = await provider.createChatCompletion([
            {
                role: "system",
                content: `You are a content filter. Check if the user's post is relevant to the topic: "${topic}".
Output ONLY "YES" if relevant, or "NO" if not.
Criteria:
- Broadly related key concepts are acceptable.
- If the post is completely unrelated, output NO.
- If unsure, lean towards YES.`
            },
            { role: "user", content: `Post content: "${content}"` },
        ], {
            model: aiSettings?.aiModel || "llama-3.1-8b-instant",
            temperature: 0.0,
            max_tokens: 5,
        });

        const trimmed = answer?.trim().toUpperCase();
        console.log(`[Topic Check] Topic: "${topic}" | Answer: ${trimmed}`);
        return trimmed === "YES";
    } catch (e: any) {
        console.error("Topic check failed:", e.message);
        return true; // Fail open on error
    }
}

export async function translateContent(text: string, translationPrompt: string, aiSettings?: WorkspaceSettings): Promise<string> {
    const provider = getWorkspaceProvider(aiSettings);

    try {
        const result = await provider.createChatCompletion([
            { role: "system", content: translationPrompt },
            { role: "user", content: text },
        ], {
            model: aiSettings?.aiModel || "llama-3.3-70b-versatile",
            temperature: 0.1,
        });

        return result || "Translation failed";
    } catch (e: any) {
        console.error("Translation failed:", e.message);
        return "Translation failed";
    }
}
