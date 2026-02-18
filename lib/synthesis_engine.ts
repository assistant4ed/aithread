
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
    targetPublishTimeStr?: string; // "HH:MM" e.g. "18:00" passed from worker
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

    // Compute scheduledPublishAt if target time is provided
    let scheduledAt: Date | undefined;
    if (settings.targetPublishTimeStr) {
        // Parse HH:MM
        const [h, m] = settings.targetPublishTimeStr.split(":").map(Number);
        const now = new Date();
        const candidate = new Date();
        candidate.setHours(h, m, 0, 0);

        // If candidate is in the past (e.g. slight drift), schedule for tomorrow? 
        // Or assume it's for today. The pipeline triggers synthesis BEFORE publish, so it should be future.
        // If it's close, it's fine.
        if (candidate.getTime() < now.getTime() - 1000 * 60 * 60) {
            // If it's more than 1 hour in the past, assume it's tomorrow (edge case)
            candidate.setDate(candidate.getDate() + 1);
        }
        scheduledAt = candidate;
        console.log(`[Synthesis] Articles will be scheduled for: ${scheduledAt.toLocaleString()}`);
    }

    // 1. Lookback: 72 hours
    const threeDaysAgo = new Date(Date.now() - 72 * 60 * 60 * 1000);

    const posts = await prisma.post.findMany({
        where: {
            workspaceId,
            createdAt: { gte: threeDaysAgo },
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
    const docs: Document[] = posts
        .filter(p => p.contentOriginal && p.contentOriginal.length > 20)
        .map(p => ({
            id: p.id,
            text: p.contentOriginal || "",
        }));

    console.log(`[Synthesis] Clustering ${docs.length} posts...`);
    const rawClusters = clusterPosts(docs, 0.35);

    // 3. Threshold & Synthesis
    const allAuthors = new Set(posts.map(p => p.sourceAccount));
    const totalTracked = allAuthors.size || 1;

    // FIX: Minimum 2 authors required (or 5%, whichever is higher)
    const thresholdCount = Math.max(2, Math.ceil(totalTracked * 0.05));

    console.log(`[Synthesis] Found ${rawClusters.length} clusters. Threshold: ${thresholdCount} authors.`);

    let newArticles = 0;

    for (const cluster of rawClusters) {
        const clusterPosts = posts.filter(p => cluster.postIds.includes(p.id));
        const authors = new Set(clusterPosts.map(p => p.sourceAccount));

        // 3a. Check Threshold
        if (authors.size < thresholdCount) {
            continue;
        }

        // 3b. Check if this cluster has any "new" news
        const hasPending = clusterPosts.some(p => p.coherenceStatus === "PENDING" || p.coherenceStatus === "ISOLATED");
        if (!hasPending) continue;

        console.log(`[Synthesis] Processing valid cluster with ${authors.size} authors, ${clusterPosts.length} posts.`);

        // 4. Synthesize
        const synthesis = await synthesizeCluster(clusterPosts.map(p => p.contentOriginal || "").join("\n\n---\n\n"));

        if (!synthesis) {
            console.log("  -> Synthesis failed / empty response.");
            continue;
        }

        // 5. Translate & Persist & Sanitize
        const rawContent = await translateText(synthesis.content, `Translate this text to ${settings.synthesisLanguage}. Maintain the journalistic tone. Output ONLY the translated text. Do NOT include notes, alternatives, disclaimers, or any meta-commentary.`);
        const rawTitle = await translateText(synthesis.headline, `Translate this headline to ${settings.synthesisLanguage}. Keep it punchy. Output ONLY the translated text.`);

        const translatedContent = sanitizeText(rawContent);
        const translatedTitle = sanitizeText(rawTitle, { isHeadline: true });

        if (!translatedContent || !translatedTitle) {
            console.log("  -> Synthesis rejected by sanitizer.");
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
                status: "PENDING_REVIEW",
                scheduledPublishAt: scheduledAt,
            },
        });

        // Mark posts as COHERENT
        await prisma.post.updateMany({
            where: { id: { in: cluster.postIds } },
            data: {
                coherenceStatus: "COHERENT",
                topicClusterId: article.id,
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
