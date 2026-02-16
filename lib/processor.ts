import { PrismaClient } from "@prisma/client";
import Groq from "groq-sdk";

import { getSettings } from "./sheet_config";

const prisma = new PrismaClient();

// Initialize Groq
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export async function processPost(postData: any, accountId: string) {
    const settings = await getSettings();

    // 1. Check if post exists
    const existing = await prisma.post.findUnique({
        where: { thread_id: postData.threadId },
    });

    if (existing) {
        // Update stats
        await prisma.post.update({
            where: { id: existing.id },
            data: {
                likes: postData.likes,
                replies: postData.replies,
                reposts: postData.reposts,
                hot_score: calculateHotScore(postData),
            },
        });
        return;
    }

    // 2. Score
    const score = calculateHotScore(postData);

    // 3. Translate if hot (threshold from sheet)
    let translated = "";
    if (score > settings.hotScoreThreshold) {
        translated = await translateContent(postData.content);
    }

    // 4. Save
    const savedPost = await prisma.post.create({
        data: {
            thread_id: postData.threadId,
            content_original: postData.content,
            content_translated: translated,
            media_urls: JSON.stringify(postData.mediaUrls),
            likes: postData.likes,
            replies: postData.replies,
            reposts: postData.reposts,
            hot_score: score,
            url: postData.postUrl,
            account_id: accountId,
            posted_at: new Date(), // Approximate
        },
    });
    return savedPost;
}

function calculateHotScore(post: any): number {
    return (post.likes * 1.5) + (post.replies * 2) + (post.reposts * 1);
}

export async function translateContent(text: string): Promise<string> {
    if (!process.env.GROQ_API_KEY) return "Translation unavailable (No API Key)";

    const settings = await getSettings();

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: settings.translationPrompt
                },
                {
                    role: "user",
                    content: text
                }
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
