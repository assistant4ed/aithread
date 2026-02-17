import { PrismaClient, CoherenceStatus } from "@prisma/client";
import Groq from "groq-sdk";

import { getSettings } from "./sheet_config";

const prisma = new PrismaClient();

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

export interface ProcessPostOptions {
    skipTranslation?: boolean;
}

export async function processPost(postData: any, accountId: string, options: ProcessPostOptions = {}) {
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

    // 3. Filtering
    // 3a. Engagement Filter
    if (postData.likes < settings.minLikes) {
        console.log(`Skipping post ${postData.threadId}: Likes ${postData.likes} < ${settings.minLikes}`);
        return;
    }

    // 3b. Word Count Filter
    const wordCount = postData.content.split(/\s+/).length;
    if (wordCount < settings.minWords) {
        console.log(`Skipping post ${postData.threadId}: Word count ${wordCount} < ${settings.minWords}`);
        return;
    }

    // 3c. Topic Filter (AI)
    const isRelevant = await checkTopicRelevance(postData.content, settings.topicFilterPrompt);
    if (!isRelevant) {
        console.log(`Skipping post ${postData.threadId}: Irrelevant topic`);
        return;
    }

    // 4. Coherence/Trend Flow
    // Instead of immediate translation/publishing, we mark as PENDING coherence check.
    // Unless we do an "optimistic" check here, but simplest is to just save as PENDING.

    const coherenceStatus = CoherenceStatus.PENDING;

    // 5. Save
    const savedPost = await prisma.post.create({
        data: {
            thread_id: postData.threadId,
            content_original: postData.content,
            content_translated: "", // Empty for now, will translate when coherent
            media_urls: JSON.stringify(postData.mediaUrls),
            likes: postData.likes,
            replies: postData.replies,
            reposts: postData.reposts,
            hot_score: score,
            url: postData.postUrl,
            account_id: accountId,
            posted_at: new Date(), // Approximate
            coherence_status: coherenceStatus
        },
    });
    return savedPost;
}

function calculateHotScore(post: any): number {
    return (post.likes * 1.5) + (post.replies * 2) + (post.reposts * 1);
}

export async function checkTopicRelevance(text: string, prompt: string): Promise<boolean> {
    if (!process.env.GROQ_API_KEY) return true;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                {
                    role: "system",
                    content: prompt
                },
                {
                    role: "user",
                    content: text
                }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
        });

        const result = completion.choices[0]?.message?.content?.trim().toLowerCase();
        return result === "true";
    } catch (e: any) {
        console.error("Topic check failed:", e.message);
        return true; // Fail open
    }
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
