import { prisma } from "./prisma";
import Groq from "groq-sdk";
import { translateContent } from "./processor";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

// Maximum posts to send to LLM at once to avoid context limits
const BATCH_SIZE = 50;

export interface TrendSettings {
    trendConsensusCount: number;
    translationPrompt: string;
}

/**
 * Run trend analysis for a specific workspace.
 * Clusters recent PENDING posts and marks multi-author clusters as COHERENT.
 */
export async function runTrendAnalysis(workspaceId: string, settings: TrendSettings) {
    console.log(`[Trend] Starting analysis for workspace ${workspaceId}...`);

    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
        where: {
            workspaceId,
            createdAt: { gte: twoDaysAgo },
            OR: [
                { coherenceStatus: "PENDING" },
                { coherenceStatus: "COHERENT" },
            ],
        },
        select: {
            id: true,
            contentOriginal: true,
            sourceAccount: true,
            coherenceStatus: true,
            topicClusterId: true,
        },
    });

    if (posts.length === 0) {
        console.log("[Trend] No posts to analyze.");
        return;
    }

    const pendingPosts = posts.filter(p => p.coherenceStatus === "PENDING");
    if (pendingPosts.length === 0) {
        console.log("[Trend] No pending posts to classify.");
        return;
    }

    console.log(`[Trend] Analyzing ${posts.length} posts (${pendingPosts.length} pending)...`);

    const postSummaries = posts.map(p => ({
        id: p.id,
        text: p.contentOriginal?.slice(0, 200) || "",
        status: p.coherenceStatus,
        clusterId: p.topicClusterId,
    }));

    const clusters = await performClustering(postSummaries, settings.trendConsensusCount);

    for (const cluster of clusters) {
        const clusterPosts = posts.filter(p => cluster.postIds.includes(p.id));
        const authors = new Set(clusterPosts.map(p => p.sourceAccount));
        const isTrend = authors.size >= settings.trendConsensusCount;

        if (isTrend) {
            console.log(`[Trend] Trend found: "${cluster.topicName}" with ${authors.size} authors.`);

            for (const p of clusterPosts) {
                if (p.coherenceStatus === "PENDING") {
                    const translated = await translateContent(p.contentOriginal || "", settings.translationPrompt);

                    await prisma.post.update({
                        where: { id: p.id },
                        data: {
                            coherenceStatus: "COHERENT",
                            topicClusterId: cluster.topicName,
                            contentTranslated: translated,
                            lastCoherenceCheck: new Date(),
                        },
                    });
                }
            }
        } else {
            console.log(`[Trend] Cluster "${cluster.topicName}" has only ${authors.size} authors. Keeping pending.`);
        }
    }
}

interface PostSummary {
    id: string;
    text: string;
    status: string;
    clusterId: string | null;
}

interface ClusterResult {
    topicName: string;
    postIds: string[];
}

async function performClustering(posts: PostSummary[], minAuthors: number): Promise<ClusterResult[]> {
    const prompt = `
    You are a data analyst clustering social media posts to find trends.
    
    INPUT: A list of posts (id, text, status).
    TASK: Group these posts into specific topics.
    RULES:
    1. A topic must have a clear, shared subject (e.g., "OpenAI Sora release", "Nvidia earnings", "Gemini 1.5 Pro").
    2. General topics like "AI news" or "Coding" are TOO BROAD. Be specific.
    3. Ignore posts that are completely unrelated to others.
    4. Output JSON format: { "clusters": [ { "topicName": "...", "postIds": ["..."] } ] }
    5. ONLY output the JSON.
    `;

    try {
        const content = JSON.stringify(posts);

        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: `Here are the posts:\n${content}` },
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        return parsed.clusters || [];
    } catch (e) {
        console.error("[Trend] Clustering failed:", e);
        return [];
    }
}
