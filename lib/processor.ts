import { PrismaClient } from "@prisma/client";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API || "");
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

export async function processPost(postData: any, accountId: string) {
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

    // 3. Translate if hot (threshold > 100 or whatever)
    let translated = "";
    if (score > 50) { // Arbitrary threshold for demo
        translated = await translateContent(postData.content);
    }

    // 4. Save
    await prisma.post.create({
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
}

function calculateHotScore(post: any): number {
    return (post.likes * 1.5) + (post.replies * 2) + (post.reposts * 1);
}

async function translateContent(text: string): Promise<string> {
    if (!process.env.GEMINI_API) return "Translation unavailable (No API Key)";

    try {
        const prompt = `You are a professional translator. Translate the following Threads post to Traditional Chinese (Hong Kong style, Cantonese nuances if applicable). Maintain the tone and brevity.\n\n${text}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (e) {
        console.error("Translation failed:", e);
        return "Translation failed";
    }
}
