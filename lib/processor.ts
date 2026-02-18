import { prisma } from "./prisma";
import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export interface WorkspaceSettings {
    translationPrompt: string;
    hotScoreThreshold: number;
    topicFilter?: string | null;
    maxPostAgeHours?: number;
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
    },
    sourceAccount: string,
    workspaceId: string,
    settings: WorkspaceSettings,
    options: ProcessPostOptions = {},
    followerCount: number = 0
) {
    const validPostedAt = safeDate(postData.postedAt);

    // 1. Freshness gate — skip posts older than maxPostAgeHours
    // STRICT MODE: If maxPostAgeHours is set, we MUST have a valid date.
    if (settings.maxPostAgeHours) {
        if (!validPostedAt) {
            console.log(`[Processor] Skipping post ${postData.threadId} (missing valid timestamp, likely old/pinned)`);
            return undefined;
        }

        const ageMs = Date.now() - validPostedAt.getTime();
        const ageHours = ageMs / (1000 * 60 * 60);
        if (ageHours > settings.maxPostAgeHours) {
            console.log(`[Processor] Skipping outdated post ${postData.threadId} (${ageHours.toFixed(0)}h old, limit: ${settings.maxPostAgeHours}h)`);
            return undefined;
        }
    }

    // 2. Check if post exists
    const existing = await prisma.post.findUnique({
        where: { threadId: postData.threadId },
    });

    if (existing) {
        // Update engagement stats
        const newScore = calculateHotScore({ ...postData, postedAt: validPostedAt });
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

    // 3. Topic Filter Check
    if (settings.topicFilter && postData.content) {
        const isRelevant = await checkTopicRelevance(postData.content, settings.topicFilter);
        if (!isRelevant) {
            console.log(`[Processor] Post rejected by topic filter: "${settings.topicFilter}"`);

            // USER REQUEST: Do not save rejected posts to DB to save space/calls.
            // We rely on the fact that if we scrape it again, we'll just check filter again (cost of API vs cost of DB).
            return undefined;
        }
    }

    // 4. Score
    const score = calculateHotScore({ ...postData, postedAt: validPostedAt, followerCount });
    const finalScore = isNaN(score) ? 0 : score;

    // 5. Hot score gate — skip low-engagement posts entirely
    if (finalScore < settings.hotScoreThreshold) {
        console.log(`[Processor] Skipping low-score post ${postData.threadId} (score: ${finalScore.toFixed(0)}, threshold: ${settings.hotScoreThreshold})`);
        return undefined;
    }

    // 6. Translate if not skipped
    // USER REQUEST: Scraped posts are NOT to be translated, only original is kept.
    // Translation happens during synthesis.
    // let translated = "";
    // if (!options.skipTranslation) {
    //    translated = await translateContent(postData.content, settings.translationPrompt);
    // }

    // 7. Save
    const savedPost = await prisma.post.create({
        data: {
            threadId: postData.threadId,
            sourceAccount,
            contentOriginal: postData.content,
            contentTranslated: null, // No individual post translation
            mediaUrls: postData.mediaUrls,
            views: postData.views,
            likes: postData.likes,
            replies: postData.replies,
            reposts: postData.reposts,
            hotScore: finalScore,
            sourceUrl: postData.postUrl,
            postedAt: validPostedAt || null,
            status: "PENDING_REVIEW",
            workspaceId,
        },
    });

    return savedPost;
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
    const decayFactor = Math.pow(0.5, ageHours / 24); // Half-life = 24 hours
    const result = baseScore * decayFactor;
    return isNaN(result) ? baseScore : result;
}

export async function checkTopicRelevance(content: string, topic: string): Promise<boolean> {
    if (!process.env.GROQ_API_KEY) return true; // Fail open if no API key

    try {
        const completion = await groq.chat.completions.create({
            messages: [
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
            ],
            model: "llama-3.1-8b-instant",
            temperature: 0.0,
            max_tokens: 5,
        });

        const answer = completion.choices[0]?.message?.content?.trim().toUpperCase();
        console.log(`[Topic Check] Topic: "${topic}" | Answer: ${answer}`);
        return answer === "YES";
    } catch (e: any) {
        console.error("Topic check failed:", e.message);
        return true; // Fail open on error
    }
}

export async function translateContent(text: string, translationPrompt: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) return "Translation unavailable (No API Key)";

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: translationPrompt },
                { role: "user", content: text },
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
        });

        return completion.choices[0]?.message?.content || "Translation failed";
    } catch (e: any) {
        console.error("Translation failed:", e.message);
        return "Translation failed";
    }
}
