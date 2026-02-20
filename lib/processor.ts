import { prisma } from "./prisma";
import { getProvider } from "./ai/provider";
import { calculateTopicScore, applyFreshnessAdjustment } from "./scoring/topicScore";

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
 * Helper to ensure we have a valid Date or undefined
 */
function safeDate(d: any): Date | undefined {
    if (!d) return undefined;
    const date = new Date(d);
    return isNaN(date.getTime()) ? undefined : date;
}

/**
 * Process a scraped post: check for duplicates, score, translate if hot, and save.
 * Returns the saved post if new, undefined if it already existed (stats updated).
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
    const ageHours = validPostedAt ? (Date.now() - validPostedAt.getTime()) / (1000 * 60 * 60) : 0;

    // 1. Freshness gate
    if (source?.type === 'ACCOUNT') {
        // Accounts keep hard gate
        if (settings.maxPostAgeHours && ageHours > settings.maxPostAgeHours) {
            console.log(`[Processor] Skipping outdated account post ${postData.threadId} (${ageHours.toFixed(0)}h old, limit: ${settings.maxPostAgeHours}h)`);
            return undefined;
        }
    } else if (source?.type === 'TOPIC') {
        // Topics use sliding penalty (implemented in scoring step below)
        // We only apply a hard cutoff at 72h as a safety measure
        if (ageHours > 72) {
            console.log(`[Processor] Skipping very old topic post ${postData.threadId} (${ageHours.toFixed(0)}h old)`);
            return undefined;
        }
    } else if (settings.maxPostAgeHours && ageHours > settings.maxPostAgeHours) {
        // Fallback for unknown source types
        console.log(`[Processor] Skipping outdated post ${postData.threadId} (${ageHours.toFixed(0)}h old)`);
        return undefined;
    }

    // 2. Check if post exists
    const existing = await prisma.post.findUnique({
        where: { threadId: postData.threadId },
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
        return undefined; // Not new
    }

    // 3. Topic Filter Check (Legacy settings filter)
    if (settings.topicFilter && postData.content) {
        const isRelevant = await checkTopicRelevance(postData.content, settings.topicFilter, settings);
        if (!isRelevant) {
            console.log(`[Processor] Post rejected by topic filter: "${settings.topicFilter}"`);
            return undefined;
        }
    }

    // 4. Score & Quality Gates
    let finalScore: number;
    let passesGate = true;

    if (source?.type === 'TOPIC') {
        // Topic-specific spam filter (heuristic)
        if (isLikelySpam({ content: postData.content, followerCount })) {
            console.log(`[Processor] Topic post ${postData.threadId} rejected by spam filter heuristics.`);
            return undefined;
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
        finalScore = applyFreshnessAdjustment(scoreResult.score, ageHours, 'TOPIC');

        // Use the tier-based gate result, but we also respect the freshness adjustment (if it returned 0)
        passesGate = scoreResult.passesGate && finalScore > 0;

        if (!passesGate) {
            console.log(`[Processor] Topic post ${postData.threadId} rejected: score ${finalScore.toFixed(1)} (${scoreResult.tier} tier)`);
            return undefined;
        }

        console.log(`[Processor] Topic post ${postData.threadId} accepted: score ${finalScore.toFixed(1)} (${scoreResult.tier} tier)`);
    } else {
        // Account-based scoring
        const score = calculateHotScore({ ...postData, postedAt: validPostedAt, followerCount });
        finalScore = isNaN(score) ? 0 : (score * (source?.trustWeight || 1.0));

        // 5. Hot score gate — skip low-engagement posts
        const ingestThreshold = 10;
        if (finalScore < ingestThreshold) {
            console.log(`[Processor] Skipping low-score post ${postData.threadId} (score: ${finalScore.toFixed(1)}, threshold: ${ingestThreshold})`);
            return undefined;
        }
    }

    // 6. Save
    const savedPost = await prisma.post.create({
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
        },
    });

    return savedPost;
}

/**
 * Calculate hot score for topic posts with stricter quality gates and spam filtering.
 */
export function calculateTopicHotScore(
    post: {
        views?: number;
        likes: number;
        replies: number;
        reposts: number;
        followerCount?: number;
        postedAt?: Date;
        content: string;
    },
    source: {
        minLikes?: number | null;
        minReplies?: number | null;
        maxAgeHours?: number | null;
    }
): number {
    const validDate = safeDate(post.postedAt);
    const ageHours = validDate ? (Date.now() - validDate.getTime()) / (1000 * 60 * 60) : 0;

    // Hard gates — fail fast
    if (source.minLikes && post.likes < source.minLikes) return 0;
    if (source.minReplies && post.replies < source.minReplies) return 0;
    if (source.maxAgeHours && ageHours > source.maxAgeHours) return 0;

    // Topic-specific spam filter
    if (isLikelySpam(post)) return 0;

    // Standard hot score with topic penalty
    const baseScore = calculateHotScore(post);
    const TOPIC_TRUST_PENALTY = 0.7; // topic posts need 30% higher engagement

    return baseScore * TOPIC_TRUST_PENALTY;
}

/**
 * Heuristic spam filter for topic-based scraping.
 */
export function isLikelySpam(post: { content: string; followerCount?: number }): boolean {
    const text = post.content || "";
    const spamSignals = [
        (text.match(/follow|giveaway|airdrop|win|click here|dm me/gi)?.length || 0) >= 2,
        (text.match(/https?:\/\//g)?.length || 0) > 3, // excessive links
        (post.followerCount || 0) < 50,                // tiny accounts
        text.length < 30,                              // too short
    ];

    return spamSignals.filter(Boolean).length >= 2;
}

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
    const provider = getProvider({
        provider: aiSettings?.aiProvider || "GROQ",
        model: aiSettings?.aiModel || "llama-3.1-8b-instant",
        apiKey: aiSettings?.aiApiKey || undefined
    });

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
    const provider = getProvider({
        provider: aiSettings?.aiProvider || "GROQ",
        model: aiSettings?.aiModel || "llama-3.3-70b-versatile",
        apiKey: aiSettings?.aiApiKey || undefined
    });

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
