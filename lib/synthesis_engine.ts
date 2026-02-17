
import { prisma } from "./prisma";
import Groq from "groq-sdk";
import { clusterPosts, Document } from "./clustering";
import { sanitizeText } from "./sanitizer";

const groq = new Groq({
    apiKey: process.env.GROQ_API_KEY,
});

export interface SynthesisSettings {
    translationPrompt: string;
    synthesisLanguage: string;
}

/**
 * Run synthesis engine for a specific workspace.
 * 1. Fetch posts from last 72 hours
 * 2. Cluster them using TF-IDF + Cosine Similarity
 * 3. Filter clusters by 5% author threshold (min 2)
 * 4. Synthesize articles using Groq
 */
export async function runSynthesisEngine(workspaceId: string, settings: SynthesisSettings) {
    console.log(`[Synthesis] Starting for workspace ${workspaceId}...`);
    console.log(`[Synthesis] Target Language: ${settings.synthesisLanguage}`);

    // 1. Lookback: 72 hours
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
        where: {
            workspaceId,
            createdAt: { gte: threeDaysAgo },
            // We want to re-cluster even if they were part of an old cluster, 
            // but for now let's focus on non-coherent ones or update existing ones?
            // "The Lookback: Query PostgreSQL for all unprocessed posts" implies only new ones.
            // But synthesis needs context. Let's fetch ALL valid posts in window to form clusters.
            // But we only want to generate NEW articles if we have enough NEW data.
            // Let's stick to the prompt: "unprocessed posts"
            // Actually, if we only look at "unprocessed", we miss the context of "processed" posts that are part of the same trend.
            // Better approach: Fetch ALL posts in 72h, cluster them. 
            // If a cluster is valid (5% authors) AND contains at least one "PENDING" post, we synthesize/update it.
        },
        select: {
            id: true,
            contentOriginal: true,
            sourceAccount: true,
            coherenceStatus: true,
            threadId: true,
        },
    });

    if (posts.length === 0) {
        console.log("[Synthesis] No posts in looked back window.");
        return;
    }

    // 2. Cluster
    // Prepare documents for clustering
    const docs: Document[] = posts
        .filter(p => p.contentOriginal && p.contentOriginal.length > 20) // Filter extremely short/empty
        .map(p => ({
            id: p.id,
            text: p.contentOriginal || "",
        }));

    console.log(`[Synthesis] Clustering ${docs.length} posts...`);
    const rawClusters = clusterPosts(docs, 0.35); // 0.35 threshold (tweak based on testing)

    // 3. Threshold & Synthesis
    const allAuthors = new Set(posts.map(p => p.sourceAccount));
    const totalTracked = allAuthors.size || 1; // Avoid divide by zero, though logically should be >0

    // FIX: Minimum 2 authors required (or 5%, whichever is higher) to avoid 1-author "trends"
    const thresholdCount = Math.max(2, Math.ceil(totalTracked * 0.05));

    console.log(`[Synthesis] Found ${rawClusters.length} clusters. Threshold: ${thresholdCount} authors (5% of ${totalTracked}, min 2).`);

    let newArticles = 0;

    for (const cluster of rawClusters) {
        const clusterPosts = posts.filter(p => cluster.postIds.includes(p.id));
        const authors = new Set(clusterPosts.map(p => p.sourceAccount));

        // 3a. Check Threshold
        if (authors.size < thresholdCount) {
            continue; // Not a trend yet
        }

        // 3b. Check if this cluster has any "new" news (unprocessed/PENDING posts) or is already fully synthesized?
        // We don't want to re-synthesize the same old news every 30 mins unless there's new info.
        const hasPending = clusterPosts.some(p => p.coherenceStatus === "PENDING" || p.coherenceStatus === "ISOLATED");

        // Also check if these posts are already linked to a specialized article?
        // For simplicity, if hasPending is true, we generate/regenerate.
        if (!hasPending) continue;

        console.log(`[Synthesis] Processing valid cluster with ${authors.size} authors, ${clusterPosts.length} posts.`);

        // 4. Synthesize
        const synthesis = await synthesizeCluster(clusterPosts.map(p => p.contentOriginal || "").join("\n\n---\n\n"));

        if (!synthesis) {
            console.log("  -> Synthesis failed / empty response.");
            continue;
        }

        // 5. Translate & Persist & Sanitize
        // Translate title and content to Target Language
        const rawContent = await translateText(synthesis.content, `Translate this text to ${settings.synthesisLanguage}. Maintain the journalistic tone. Output ONLY the translated text. Do NOT include notes, alternatives, disclaimers, or any meta-commentary.`);
        const rawTitle = await translateText(synthesis.headline, `Translate this headline to ${settings.synthesisLanguage}. Keep it punchy. Output ONLY the translated text.`);

        // Sanitize output to remove LLM artifacts
        const translatedContent = sanitizeText(rawContent);
        const translatedTitle = sanitizeText(rawTitle, { isHeadline: true });

        if (!translatedContent || !translatedTitle) {
            console.log("  -> Synthesis rejected by sanitizer (empty/broken output).");
            continue;
        }

        // Create the article
        const article = await prisma.synthesizedArticle.create({
            data: {
                topicName: translatedTitle,
                articleContent: translatedContent,
                articleOriginal: synthesis.content,
                workspaceId,
                sourcePostIds: cluster.postIds,
                sourceAccounts: Array.from(authors),
                authorCount: authors.size,
                postCount: clusterPosts.length,
                status: "PENDING_REVIEW", // Needs human approval
            },
        });

        // Mark posts as COHERENT
        await prisma.post.updateMany({
            where: { id: { in: cluster.postIds } },
            data: {
                coherenceStatus: "COHERENT",
                topicClusterId: article.id, // We link to the Article ID now
                lastCoherenceCheck: new Date(),
            },
        });

        console.log(`  -> Created article: "${translatedTitle}" (ID: ${article.id})`);
        newArticles++;
    }

    console.log(`[Synthesis] Finished. Generated ${newArticles} new articles.`);
}

interface SynthesisResult {
    headline: string;
    content: string;
}

async function synthesizeCluster(textContext: string): Promise<SynthesisResult | null> {
    const prompt = `
    You are a Tech News Editor. 
    Task: Synthesize the provided raw social media posts into a single, cohesive news story.
    
    Rules:
    1. Focus on the core news/announcement.
    2. Ignore personal opinions/chatter unless relevant context.
    3. Output JSON: { "headline": "...", "content": "..." }
    4. "content" should be a 2-3 paragraph summary.
    5. JSON ONLY. No preamble. No "Here is the JSON".
    `;

    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: `Posts:\n${textContext.slice(0, 15000)}` }, // Limit context
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.2,
            response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.error("Synthesis error:", e);
        return null;
    }
}

async function translateText(text: string, prompt: string): Promise<string> {
    try {
        const completion = await groq.chat.completions.create({
            messages: [
                { role: "system", content: prompt },
                { role: "user", content: text },
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.1,
        });

        return completion.choices[0]?.message?.content || text;
    } catch (e) {
        return text;
    }
}

// Allow running directly via `tsx lib/synthesis_engine.ts`
if (process.argv[1] && process.argv[1].endsWith("synthesis_engine.ts")) {
    (async () => {
        console.log("Running manual synthesis trigger...");
        try {
            const workspaces = await prisma.workspace.findMany({ where: { isActive: true } });
            if (workspaces.length === 0) {
                console.log("No active workspaces found.");
            }
            for (const ws of workspaces) {
                await runSynthesisEngine(ws.id, {
                    translationPrompt: ws.translationPrompt,
                    synthesisLanguage: ws.synthesisLanguage,
                });
            }
        } catch (e) {
            console.error("Manual synthesis failed:", e);
        } finally {
            await prisma.$disconnect();
        }
    })();
}
