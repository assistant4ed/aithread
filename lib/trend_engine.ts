import { PrismaClient } from "@prisma/client";
import Groq from "groq-sdk";
import { getSettings } from "./sheet_config";
import { translateContent } from "./processor";

const prisma = new PrismaClient();
const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY
});

// Maximum posts to send to LLM at once to avoid context limits
const BATCH_SIZE = 50;

export async function runTrendAnalysis() {
    console.log("Starting Trend Analysis...");
    const settings = await getSettings();

    // 1. Fetch relevant posts
    // We want posts that are PENDING and recent (last 48h)
    // We also want recently COHERENT posts to help cluster new ones into existing trends
    const twoDaysAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
        where: {
            posted_at: {
                gte: twoDaysAgo
            },
            OR: [
                { coherence_status: "PENDING" },
                { coherence_status: "COHERENT" } // Include context from existing trends
            ]
        },
        select: {
            id: true,
            content_original: true,
            account_id: true, // To check for distinct authors
            coherence_status: true,
            topic_cluster_id: true
        }
    });

    if (posts.length === 0) {
        console.log("No posts to analyze.");
        return;
    }

    const pendingPosts = posts.filter(p => p.coherence_status === "PENDING");
    if (pendingPosts.length === 0) {
        console.log("No pending posts to classify.");
        return;
    }

    console.log(`Analyzing ${posts.length} posts (${pendingPosts.length} pending)...`);

    // 2. Prepare for LLM
    // We send a simplified list to the LLM
    const postSummaries = posts.map(p => ({
        id: p.id,
        text: p.content_original?.slice(0, 200) || "", // Truncate for token saving
        status: p.coherence_status,
        clusterId: p.topic_cluster_id
    }));

    // 3. LLM Clustering
    // We ask the LLM to group these into clusters.
    // If a cluster has >= trendConsensusCount distinct authors, it's valid.

    const clusters = await performClustering(postSummaries, settings.trendConsensusCount);

    // 4. Process Results
    for (const cluster of clusters) {
        // cluster is { topicName: string, postIds: string[] }

        // Check consensus within this cluster
        // We need to map back to the original posts to check authors
        const clusterPosts = posts.filter(p => cluster.postIds.includes(p.id));
        const authors = new Set(clusterPosts.map(p => p.account_id));

        const isTrend = authors.size >= settings.trendConsensusCount;

        if (isTrend) {
            console.log(`Trend found: "${cluster.topicName}" with ${authors.size} authors.`);

            // Mark all pending posts in this cluster as COHERENT
            for (const p of clusterPosts) {
                if (p.coherence_status === "PENDING") {
                    console.log(`Approving post ${p.id} for trend "${cluster.topicName}"`);

                    // Translate and Publish (Simulated by updating status)
                    // In a real flow, we might trigger a separate "Publisher" job, 
                    // but here we can just do the translation and mark it ready.
                    // For now, let's just mark COHERENT. The scraper/cron might need another step to pick up COHERENT posts and translate them?
                    // Actually, the `processPost` used to translate immediately. 
                    // Let's translate here to complete the flow.

                    const translated = await translateContent(p.content_original || "");

                    await prisma.post.update({
                        where: { id: p.id },
                        data: {
                            coherence_status: "COHERENT",
                            topic_cluster_id: cluster.topicName,
                            content_translated: translated,
                            last_coherence_check: new Date()
                        }
                    });
                }
            }
        } else {
            console.log(`Cluster "${cluster.topicName}" has only ${authors.size} authors. Keeping pending.`);
            // ensure we update topic_cluster_id even if pending, to help future clustering?
            // Maybe not, keep it simple.
        }
    }

    // Optional: Mark old PENDING posts as ISOLATED if they never found a trend
    // (Implementation omitted for safety, usually we let them expire or try for a few days)
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
                { role: "user", content: `Here are the posts:\n${content}` }
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" }
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) return [];

        const parsed = JSON.parse(raw);
        return parsed.clusters || [];

    } catch (e) {
        console.error("Clustering failed:", e);
        return [];
    }
}
