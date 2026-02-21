
import { prisma } from "./prisma";
import { getProvider } from "./ai/provider";
import { clusterPosts, Document } from "./clustering";
import { sanitizeText } from "./sanitizer";
import { POST_FORMATS } from "./postFormats";

export interface SynthesisSettings {
    translationPrompt: string;
    clusteringPrompt: string;
    synthesisLanguage: string;
    postLookbackHours?: number;
    targetPublishTimeStr?: string; // "HH:MM" e.g. "18:00" passed from worker
    hotScoreThreshold?: number;    // "Viral" threshold
    synthesisPrompt?: string;      // User-defined personality
    aiProvider?: string;
    aiModel?: string;
    aiApiKey?: string | null;
    coherenceThreshold?: number; // Minimum authors for consensus
}

/**
 * Run synthesis engine for a specific workspace.
 * 1. Fetch posts from last X hours (configured via postLookbackHours)
 * 2. Cluster them using LLM (Llama 3)
 * 3. Filter clusters by author threshold (min 2) OR viral score
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

    // 1. Lookback: Configured hours or default 48h
    const lookback = settings.postLookbackHours || 48;
    const lookbackDate = new Date(Date.now() - lookback * 60 * 60 * 1000);
    console.log(`[Synthesis] Looking back ${lookback} hours (since ${lookbackDate.toISOString()})...`);

    const posts = await prisma.post.findMany({
        where: {
            workspaceId,
            createdAt: { gte: lookbackDate },
        },
        select: {
            id: true,
            contentOriginal: true,
            sourceAccount: true,
            coherenceStatus: true,
            threadId: true,
            externalUrls: true,
            hotScore: true,
            sourceUrl: true,
            sourceType: true,
            sourceId: true,
        } as any,
    });

    if (posts.length === 0) {
        console.log("[Synthesis] No posts in looked back window.");
        return;
    }

    // 2. Cluster using LLM
    const docs: Document[] = posts
        .filter(p => !!p.contentOriginal && (p.contentOriginal as string).length > 20)
        .map(p => ({
            id: p.id,
            text: `[Author: @${p.sourceAccount}] ${p.contentOriginal || ""}`,
            sourceType: (p as any).sourceType,
            sourceId: (p as any).sourceId,
        }));

    console.log(`[Synthesis] Clustering ${docs.length} posts via LLM...`);
    const rawClusters = await clusterPostsWithLLM(docs, settings.clusteringPrompt, settings);

    // 3. Threshold & Synthesis
    const allAuthors = new Set(posts.map(p => p.sourceAccount));
    const totalTracked = allAuthors.size || 1;

    // Use configurable threshold (default 2)
    const minAuthors = settings.coherenceThreshold ?? 2;
    const thresholdCount = Math.max(minAuthors, Math.ceil(totalTracked * 0.05));

    console.log(`[Synthesis] Found ${rawClusters.length} clusters. Coherence Threshold: ${thresholdCount} authors.`);

    let newArticles = 0;

    for (const cluster of rawClusters) {
        const clusterPosts = posts.filter(p => cluster.postIds.includes(p.id));
        const authors = new Set(clusterPosts.map(p => p.sourceAccount));


        // 3a. Check Threshold (Strict Coherence for accounts, lenient for topics)
        const hasTopicPost = clusterPosts.some(p => (p as any).sourceType === "TOPIC");
        const thresholdCountForCluster = hasTopicPost ? 1 : thresholdCount;

        const isCoherent = authors.size >= thresholdCountForCluster;

        if (!isCoherent) {
            console.log(`  -> SKIPPED: Not coherent enough (Authors: ${authors.size} < ${thresholdCountForCluster}).`);
            continue;
        }

        // 3b. Check if this cluster has any "new" news
        const hasPending = clusterPosts.some(p => p.coherenceStatus === "PENDING" || p.coherenceStatus === "ISOLATED");
        if (!hasPending) {
            console.log(`  -> SKIPPED: Already processed / No pending news.`);
            continue;
        }

        console.log(`[Synthesis] Processing valid cluster with ${authors.size} authors, ${clusterPosts.length} posts.`);

        // 3c. Classify Format
        const classifyResult = await classifyCluster(clusterPosts, settings);
        const formatId = classifyResult?.format || "LISTICLE";

        // 4. Synthesize
        const synthesis = await synthesizeCluster(clusterPosts.map(p => ({
            content: p.contentOriginal || "",
            account: p.sourceAccount,
            url: p.sourceUrl || `https://www.threads.net/@${p.sourceAccount}/post/${p.threadId}`
        })), formatId, settings.synthesisPrompt, settings);

        if (!synthesis) {
            console.log("  -> Synthesis failed / empty response.");
            continue;
        }

        // 5. Translate & Persist & Sanitize
        const styleInstructions = settings.translationPrompt ? ` Style guide: "${settings.translationPrompt}"` : "";
        const rawContent = await translateText(synthesis.content, `Translate this text to ${settings.synthesisLanguage}.${styleInstructions} Maintain a high-energy, viral tone. 
        CRITICAL: Keep any @[Author] mentions and [Link]s completely untouched. Do not translate usernames or URLs.
        If the original text uses a listicle format like "🔥 [Title] - @[Author]:", maintain those exact formatting delimiters and emojis.
        Output ONLY the translated text.`, settings);
        const rawTitle = await translateText(synthesis.headline, `Translate this headline to ${settings.synthesisLanguage}.${styleInstructions} Make it extremely viral and clickable. Output ONLY the translated text.`, settings);

        const translatedContent = sanitizeText(rawContent);
        const translatedTitle = sanitizeText(rawTitle, { isHeadline: true });

        if (!translatedContent || !translatedTitle) {
            console.log("  -> Synthesis rejected by sanitizer.");
            continue;
        }

        // Aggregate external URLs
        const allUrls = clusterPosts.flatMap(p => p.externalUrls || []);
        const uniqueUrls = Array.from(new Set(allUrls));

        // 6. Auto-Approval (Optional)
        let finalStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED" = "PENDING_REVIEW";
        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId },
            select: { autoApproveDrafts: true, autoApprovePrompt: true }
        });

        if (workspace?.autoApproveDrafts) {
            console.log(`  -> Auto-approving article...`);
            const approved = await checkAutoApproval(
                translatedTitle,
                translatedContent,
                workspace.autoApprovePrompt || "Approve if the news is relevant to tech/AI and logically coherent. Reject spam, irrelevant chatter, or promotional filler.",
                settings
            );
            finalStatus = approved ? "APPROVED" : "REJECTED";
            console.log(`  -> Auto-approval result: ${finalStatus}`);
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
                status: finalStatus,
                scheduledPublishAt: scheduledAt,
                externalUrls: uniqueUrls,
                formatUsed: formatId,
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

        console.log(`  -> Created article: "${translatedTitle}" (ID: ${article.id}) Status: ${finalStatus}`);
        newArticles++;
    }

    console.log(`[Synthesis] Finished. Generated ${newArticles} new articles.`);
}

/**
 * Check if an article should be auto-approved using LLM.
 */
async function checkAutoApproval(title: string, content: string, instruction: string, settings?: SynthesisSettings): Promise<boolean> {
    const provider = getProvider({
        provider: settings?.aiProvider || "GROQ",
        model: settings?.aiModel || "llama-3.3-70b-versatile",
        apiKey: settings?.aiApiKey || undefined
    });

    const prompt = `
    You are an AI Content Moderator.
    Task: Judge if the following news article should be approved for publication.
    
    Instructions:
    ${instruction}
    
    Article Title: ${title}
    Article Content:
    ${content}
    
    Output Format:
    Return a JSON object: { "approved": true/false, "reason": "short explanation" }
    JSON ONLY.
    `;

    try {
        const raw = await provider.createChatCompletion([
            { role: "system", content: "You are a precise content judge." },
            { role: "user", content: prompt },
        ], {
            model: settings?.aiModel || "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        if (!raw) return false;
        const parsed = JSON.parse(raw);
        return !!parsed.approved;
    } catch (e) {
        console.error("[Synthesis] Auto-approval check failed:", e);
        return false; // Default to manual review on error
    }
}

import { RawCluster } from "./clustering";

// New LLM Clustering
async function clusterPostsWithLLM(posts: Document[], promptInstruction: string, settings?: SynthesisSettings): Promise<RawCluster[]> {
    if (posts.length === 0) return [];

    const provider = getProvider({
        provider: settings?.aiProvider || "GROQ",
        model: settings?.aiModel || "llama-3.3-70b-versatile",
        apiKey: settings?.aiApiKey || undefined
    });

    // Format posts for LLM
    const postsText = posts.map(p => `[ID: ${p.id}] ${p.text}`).join("\n\n");

    const systemPrompt = `
    You are an AI News Editor using Llama 3.
    Task: Group the following social media posts into thematic news clusters.
    
    Instructions:
    ${promptInstruction}
    
    Validation Rules:
    1. A cluster MUST share a specific news topic (e.g., "Release of Claude 3.5 Sonnet", "SpaceX Launch").
    2. Do NOT group unrelated posts or posts about different topics.
    3. Ignore spam or irrelevant queries.
    
    Output Format:
    Return a JSON object with a "clusters" array.
    each cluster: { "topic": "string", "postIds": ["id1", "id2"] }
    
    JSON ONLY. No markdown, no "Here is the JSON".
    `;

    try {
        const raw = await provider.createChatCompletion([
            { role: "system", content: systemPrompt },
            { role: "user", content: `Posts to cluster:\n\n${postsText.slice(0, 25000)}` }, // Limit 25k chars ~ 6k tokens
        ], {
            model: settings?.aiModel || "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        if (!raw) return [];

        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.clusters)) {
            return parsed.clusters.map((c: any) => ({
                postIds: c.postIds || [],
                terms: [c.topic || ""]
            }));
        }
        return [];
    } catch (e) {
        console.error("[Synthesis] LLM Clustering failed:", e);
        return [];
    }
}


interface SynthesisResult {
    headline: string;
    content: string;
}

async function classifyCluster(posts: any[], settings?: SynthesisSettings) {
    const postSummaries = posts.map(p => `- ${p.contentOriginal?.slice(0, 200)}`).join('\n');

    const provider = getProvider({
        provider: settings?.aiProvider || "GROQ",
        model: settings?.aiModel || "llama-3.1-8b-instant",
        apiKey: settings?.aiApiKey || undefined
    });

    const prompt = `You are a social media editor. Read these posts about the same story and decide which format best fits the content.

## POSTS
${postSummaries}

## AVAILABLE FORMATS
${Object.values(POST_FORMATS).map(f =>
        `${f.id}: ${f.description}\nUse when: ${f.trigger}`
    ).join('\n\n')}

## OUTPUT — JSON ONLY
{
  "format": "one of the format IDs above",
  "reason": "one sentence explaining why"
}`;

    try {
        const raw = await provider.createChatCompletion([
            { role: 'user', content: prompt }
        ], {
            model: settings?.aiModel || 'llama-3.1-8b-instant',
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        if (!raw) return null;
        return JSON.parse(raw);
    } catch (e) {
        console.error("[Synthesis] Classify error:", e);
        return null;
    }
}

export async function synthesizeCluster(posts: { content: string; account: string; url: string }[], formatId: string, synthesisPrompt?: string, settings?: SynthesisSettings): Promise<SynthesisResult | null> {
    const format = POST_FORMATS[formatId] || POST_FORMATS["LISTICLE"];
    const textContext = posts.map(p => `[Author: @${p.account}] [URL: ${p.url}]\n${p.content}`).join("\n\n---\n\n");

    const provider = getProvider({
        provider: settings?.aiProvider || "GROQ",
        model: settings?.aiModel || "llama-3.3-70b-versatile",
        apiKey: settings?.aiApiKey || undefined
    });

    const defaultPrompt = `You are a viral social media editor. Synthesize these clustered social media posts into a high-impact, skimmable curated summary using the ${format.id} format.`;
    const userPrompt = synthesisPrompt || defaultPrompt;

    const prompt = `
    ${userPrompt}
    
    ## FORMAT RULES
    Structure: ${format.structure}
    Style: ${format.description}
    
    ## HOOK RULE
    Open with 1-2 sentences max. Short. Punchy. Makes people stop scrolling.
    
    Rules:
    1. NO ACADEMIC PHRASING: Do NOT use "Source 1 reports", "Author discusses", or "Post analyzes". 
    2. LEAD WITH VALUE: Hook the reader immediately.
    3. "content" MUST be a string, NOT an array of strings. Fill it with the markdown content matching the chosen format.
    4. Make sure to attribute the original authors using @[Author Name] and their [Link]s matching the structure of the chosen format.
    5. Output JSON: { "headline": "...", "content": "..." }
    6. JSON ONLY. No preamble.
    `;

    try {
        const raw = await provider.createChatCompletion([
            { role: "system", content: prompt },
            { role: "user", content: `Posts:\n${textContext.slice(0, 15000)}` }, // Limit context
        ], {
            model: settings?.aiModel || "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        if (!raw) return null;
        const parsed = JSON.parse(raw);

        // Safety: If content is an array, join it
        if (Array.isArray(parsed.content)) {
            parsed.content = parsed.content.join("\n");
        }

        return parsed;
    } catch (e) {
        console.error("Synthesis error:", e);
        return null;
    }
}

export async function translateText(text: string, prompt: string, settings?: SynthesisSettings): Promise<string> {
    const provider = getProvider({
        provider: settings?.aiProvider || "GROQ",
        model: settings?.aiModel || "llama-3.3-70b-versatile",
        apiKey: settings?.aiApiKey || undefined
    });

    try {
        const result = await provider.createChatCompletion([
            { role: "system", content: prompt },
            { role: "user", content: text },
        ], {
            model: settings?.aiModel || "llama-3.3-70b-versatile",
            temperature: 0.1,
        });

        return result || text;
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
                    clusteringPrompt: ws.clusteringPrompt,
                    synthesisLanguage: ws.synthesisLanguage,
                    postLookbackHours: ws.postLookbackHours,
                    hotScoreThreshold: ws.hotScoreThreshold, // Pass threshold
                    synthesisPrompt: (ws as any).synthesisPrompt,
                    aiProvider: (ws as any).aiProvider,
                    aiModel: (ws as any).aiModel,
                    aiApiKey: (ws as any).aiApiKey,
                    coherenceThreshold: (ws as any).coherenceThreshold,
                });
            }
        } catch (e) {
            console.error("Manual synthesis failed:", e);
        } finally {
            await prisma.$disconnect();
        }
    })();
}
