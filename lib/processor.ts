import { prisma } from "./prisma";
import Groq from "groq-sdk";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export interface WorkspaceSettings {
    translationPrompt: string;
    hotScoreThreshold: number;
}

export interface ProcessPostOptions {
    skipTranslation?: boolean;
}

/**
 * Process a scraped post: check for duplicates, score, translate if hot, and save.
 * Returns the saved post if new, undefined if it already existed (stats updated).
 */
export async function processPost(
    postData: {
        threadId: string;
        content: string;
        mediaUrls: { url: string; type: string }[];
        likes: number;
        replies: number;
        reposts: number;
        postUrl: string;
    },
    sourceAccount: string,
    workspaceId: string,
    settings: WorkspaceSettings,
    options: ProcessPostOptions = {}
) {
    // 1. Check if post exists
    const existing = await prisma.post.findUnique({
        where: { threadId: postData.threadId },
    });

    if (existing) {
        // Update engagement stats
        const newScore = calculateHotScore(postData);
        await prisma.post.update({
            where: { id: existing.id },
            data: {
                likes: postData.likes,
                replies: postData.replies,
                reposts: postData.reposts,
                hotScore: newScore,
            },
        });
        return undefined; // Not new
    }

    // 2. Score
    const score = calculateHotScore(postData);

    // 3. Translate if hot and not skipped
    let translated = "";
    if (!options.skipTranslation && score > settings.hotScoreThreshold) {
        translated = await translateContent(postData.content, settings.translationPrompt);
    }

    // 4. Save
    const savedPost = await prisma.post.create({
        data: {
            threadId: postData.threadId,
            sourceAccount,
            contentOriginal: postData.content,
            contentTranslated: translated || null,
            mediaUrls: postData.mediaUrls,
            likes: postData.likes,
            replies: postData.replies,
            reposts: postData.reposts,
            hotScore: score,
            sourceUrl: postData.postUrl,
            status: "PENDING_REVIEW",
            workspaceId,
        },
    });

    return savedPost;
}

export function calculateHotScore(post: { likes: number; replies: number; reposts: number }): number {
    return (post.likes * 1.5) + (post.replies * 2) + (post.reposts * 1);
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
