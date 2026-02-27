import { prisma } from "./prisma";
import { getProvider, FallbackProvider } from "./ai/provider";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { clusterPosts, Document } from "./clustering";
import { sanitizeText, stripPlatformReferences } from "./sanitizer";
import { POST_FORMATS } from "./postFormats";
import { uploadBufferToStorage } from "./storage";

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

export interface SynthesisStats {
    postsInWindow: number;
    postsClusterable: number;
    clustersFound: number;
    clustersSkipped: number;
    articlesGenerated: number;
    reason?: string;
}

/**
 * Centrally resolve AI provider based on workspace settings with consistent defaults.
 */
function getWorkspaceProvider(settings?: SynthesisSettings, modelOverride?: string, providerOverride?: string) {
    const primary = getProvider({
        provider: providerOverride || settings?.aiProvider || "GROQ",
        model: modelOverride || settings?.aiModel || "llama-3.3-70b-versatile",
        apiKey: settings?.aiApiKey || undefined,
    });

    // Automatically fallback to GROQ (Llama 3.3 70B) if the primary isn't GROQ already
    const primaryProviderName = (providerOverride || settings?.aiProvider || "GROQ").toUpperCase();
    if (primaryProviderName !== "GROQ") {
        const fallback = getProvider({
            provider: "GROQ",
            model: "llama-3.3-70b-versatile",
        });
        return new FallbackProvider([primary, fallback]);
    }

    return primary;
}

/**
 * Run synthesis engine for a specific workspace.
 * 1. Fetch posts from last X hours (configured via postLookbackHours)
 * 2. Cluster them using LLM
 * 3. Filter clusters by author threshold (min 2) OR viral score
 * 4. Synthesize articles using configured AI
 */
export async function runSynthesisEngine(workspaceId: string, settings: SynthesisSettings): Promise<SynthesisStats> {
    console.log(`[Synthesis] Starting for workspace ${workspaceId}...`);
    console.log(`[Synthesis] Target Language: ${settings.synthesisLanguage}`);

    const stats: SynthesisStats = {
        postsInWindow: 0,
        postsClusterable: 0,
        clustersFound: 0,
        clustersSkipped: 0,
        articlesGenerated: 0
    };

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
    const limitDate = new Date(Date.now() - (settings.postLookbackHours || 24) * 3600000);
    const minHotScore = settings.hotScoreThreshold || 0;
    console.log(`[Synthesis] Looking back ${settings.postLookbackHours || 24} hours (since ${limitDate.toISOString()}) for posts with hotScore >= ${minHotScore}...`);

    const posts = await prisma.post.findMany({
        where: {
            workspaceId,
            status: "PENDING_REVIEW",
            postedAt: { gte: limitDate },
            hotScore: { gte: minHotScore },
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
            mediaUrls: true,
        } as any,
    });

    stats.postsInWindow = posts.length;

    if (posts.length === 0) {
        console.log("[Synthesis] No posts in looked back window.");
        stats.reason = "No pending posts in the lookback window.";
        return stats;
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

    stats.postsClusterable = docs.length;

    if (docs.length === 0) {
        console.log("[Synthesis] No posts with enough content to cluster.");
        stats.reason = "Posts found but none had enough text content for clustering.";
        return stats;
    }

    console.log(`[Synthesis] Clustering ${docs.length} posts via LLM...`);
    const rawClusters = await clusterPostsWithLLM(docs, settings.clusteringPrompt, settings);
    stats.clustersFound = rawClusters.length;

    if (rawClusters.length === 0) {
        console.log("[Synthesis] No clusters formed by LLM.");
        stats.reason = "LLM could not find groups of related posts.";
        return stats;
    }

    // 3. Threshold & Synthesis
    const allAuthors = new Set(posts.map(p => p.sourceAccount));
    const totalTracked = allAuthors.size || 1;

    // Use configurable threshold (default 2)
    const minAuthors = settings.coherenceThreshold ?? 2;
    const thresholdCount = Math.max(minAuthors, Math.ceil(totalTracked * 0.05));

    console.log(`[Synthesis] Found ${rawClusters.length} clusters. Coherence Threshold: ${thresholdCount} authors.`);

    for (const cluster of rawClusters) {
        const clusterPosts = posts.filter(p => cluster.postIds.includes(p.id));
        const authors = new Set(clusterPosts.map(p => p.sourceAccount));


        // 3a. Check Threshold (Strict Coherence for accounts, lenient for topics)
        const hasTopicPost = clusterPosts.some(p => (p as any).sourceType === "TOPIC");
        const thresholdCountForCluster = hasTopicPost ? 1 : thresholdCount;

        const isCoherent = authors.size >= thresholdCountForCluster;

        if (!isCoherent) {
            console.log(`  -> SKIPPED: Not coherent enough (Authors: ${authors.size} < ${thresholdCountForCluster}).`);
            stats.clustersSkipped++;
            continue;
        }

        // 3b. Check if this cluster has any "new" news
        const hasPending = clusterPosts.some(p => p.coherenceStatus === "PENDING" || p.coherenceStatus === "ISOLATED");
        if (!hasPending) {
            console.log(`  -> SKIPPED: Already processed / No pending news.`);
            stats.clustersSkipped++;
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
            stats.clustersSkipped++;
            continue;
        }

        // 4b. Media Selection & Generation (Isolated to prevent crashes)
        let selectedMediaUrl: string | null = null;
        let selectedMediaType: string | null = null;

        try {
            let allMedia: { url: string, type: string }[] = [];
            for (const p of clusterPosts) {
                if (p.mediaUrls && Array.isArray(p.mediaUrls)) {
                    const mediaArray = p.mediaUrls as any[];
                    for (const m of mediaArray) {
                        if (m) {
                            const mObj = m as any;
                            if (typeof mObj === 'string') {
                                allMedia.push({ url: mObj, type: 'image' });
                            } else if (mObj.url) {
                                allMedia.push({ url: mObj.url, type: mObj.type || 'image' });
                            }
                        }
                    }
                }
            }

            // Priority 1: If there's a video, just use it
            const videoMedia = allMedia.find(m => m.type === 'video' || m.url.toLowerCase().includes('.mp4'));
            if (videoMedia) {
                selectedMediaUrl = videoMedia.url;
                selectedMediaType = 'video';
                console.log(`  -> Auto-selected video: ${selectedMediaUrl}`);
            } else {
                // Candidates are images
                const imageCandidates = allMedia.filter(m => m.type === 'image' || !m.url.toLowerCase().includes('.mp4')).map(m => m.url);
                if (imageCandidates.length > 0) {
                    selectedMediaUrl = await filterRelevantMedia(synthesis.content, imageCandidates, settings);
                    if (selectedMediaUrl) {
                        selectedMediaType = 'image';
                        console.log(`  -> Vision selected image: ${selectedMediaUrl}`);
                    }
                }
            }

            // Fallback to Image Generation if no media selected/found
            if (!selectedMediaUrl) {
                console.log(`  -> No media selected. Attempting image generation...`);
                const generatedUrl = await generateFallbackImage(synthesis.content, settings);
                if (generatedUrl) {
                    selectedMediaUrl = generatedUrl;
                    selectedMediaType = 'image';
                    console.log(`  -> Generated fallback image: ${selectedMediaUrl}`);
                }
            }
        } catch (mediaErr: any) {
            console.error(`[Synthesis] Media selection/generation failed for cluster: ${mediaErr.message}`);
            // Non-fatal, proceed with text-only
        }

        // 5. Translate & Persist & Sanitize
        // Safety net: strip any trailing editorial sections before translation
        let cleanContent = synthesis.content;
        cleanContent = cleanContent
            .replace(/\n{2,}(?:📌|🎥|🖼️|💡|🔑|📝)\s*(?:What it signals|Video idea|Image idea|Visuals to use|Content idea)[^\n]*(?:\n[\s\S]*)?$/gu, '')
            .replace(/\n{2,}(?:What it signals|Visuals to use|Video idea|Image idea|Content idea)[:\s][\s\S]*/i, '')
            .trim();

        const styleInstructions = settings.translationPrompt ? ` Style guide: "${settings.translationPrompt}"` : "";
        const rawContent = await translateText(cleanContent, `Translate this text to ${settings.synthesisLanguage}.${styleInstructions} Maintain a high-energy, viral tone. 
        CRITICAL: Do NOT include any @usernames, author handles, or URLs.
        If the original text uses a listicle format like "\uD83D\uDD25 [Title] - [Generic Attribution]:", maintain those exact formatting delimiters and emojis.
        Output ONLY the translated text.`, settings);
        const rawTitle = await translateText(synthesis.headline, `Translate this headline to ${settings.synthesisLanguage}.${styleInstructions} Make it extremely viral and clickable. Output ONLY the translated text.`, settings);

        const translatedContent = sanitizeText(rawContent);
        const translatedTitle = sanitizeText(rawTitle, { isHeadline: true });

        if (!translatedContent || !translatedTitle) {
            console.log("  -> Synthesis rejected by sanitizer.");
            stats.clustersSkipped++;
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
                selectedMediaUrl: selectedMediaUrl,
                selectedMediaType: selectedMediaType,
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
        stats.articlesGenerated++;
    }

    if (stats.articlesGenerated === 0 && !stats.reason) {
        if (stats.clustersFound > 0) {
            stats.reason = `Found ${stats.clustersFound} clusters, but none passed the coherence threshold or news filtering.`;
        } else {
            stats.reason = "Could not form any significant clusters from the current pool of posts.";
        }
    }

    console.log(`[Synthesis] Finished. Generated ${stats.articlesGenerated} new articles.`);
    return stats;
}

/**
 * Check if an article should be auto-approved using LLM.
 */
async function checkAutoApproval(title: string, content: string, instruction: string, settings?: SynthesisSettings): Promise<boolean> {
    const provider = getWorkspaceProvider(settings);


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

    const provider = getWorkspaceProvider(settings);


    // Format posts for LLM
    const postsText = posts.map(p => `[ID: ${p.id}] ${p.text}`).join("\n\n");

    const systemPrompt = `
    You are an AI News Editor.
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

    const provider = getWorkspaceProvider(settings, "llama-3.1-8b-instant");

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
    const textContext = posts.map(p => `[Account: ${p.account}]\n${stripPlatformReferences(p.content)}`).join("\n\n---\n\n");

    const provider = getWorkspaceProvider(settings);


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
    3. DO NOT OUTPUT STRUCTURAL LABELS: Do not include the structural labels from the "Structure" section (e.g. "Hook", "Key fact", "Why it matters", "CTA") in your output. These are for your internal logic and formatting only, and must not appear as text in the final output.
    4. "content" MUST be a string, NOT an array of strings. Fill it with the markdown content matching the chosen format.
    5. **CRITICAL PUBLISHING RULE:** The final output MUST be clean text. Do NOT include any @usernames, author handles, or URLs in the synthesized text. Refer to the sources generically (e.g., "Industry leaders," "Tech companies," or just state the facts).
    6. HEADLINE CORRELATION: Your headline MUST match the structure of your content. If you write a headline promising "10 things", your content MUST actually contain a bulleted/numbered list with that exact number of items. Do not write listicle headlines for paragraph-based content.
    7. Output JSON: { "headline": "...", "content": "...", "suggestions": "..." }
       - "content" = the FINAL social media post, ready to publish as-is directly to audiences. Nothing else — no media ideas, no editorial notes, no "what it signals" commentary.
       - "suggestions" = any editorial notes, media ideas, visual recommendations, or analysis. This is for internal use only and will NOT be published.
    8. JSON ONLY. No preamble.
    `;

    try {
        const raw = await provider.createChatCompletion([
            { role: "system", content: prompt },
            {
                role: "user", content: `Posts: \n${textContext.slice(0, 15000)
                    } `
            }, // Limit context
        ], {
            model: settings?.aiModel || "llama-3.3-70b-versatile",
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        if (!raw) return null;
        const parsed = JSON.parse(raw);

        // Discard editorial suggestions — only keep headline + content
        delete parsed.suggestions;

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
    const provider = getWorkspaceProvider(settings);


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

async function filterRelevantMedia(articleContent: string, candidateUrls: string[], settings?: SynthesisSettings): Promise<string | null> {
    if (!candidateUrls || candidateUrls.length === 0) return null;

    // De-duplicate and limit
    const uniqueUrls = Array.from(new Set(candidateUrls)).slice(0, 5); // Max 5 to avoid model overload

    const provider = getWorkspaceProvider(settings, "gpt-4o", "OPENAI");

    const promptText = `You are a social media editor.
We have an article below. We also have ${uniqueUrls.length} candidate images.
We need to select the MOST RELEVANT image to accompany this article.
CRITICAL RULES:
1. REJECT memes, reaction images, selfies, random screenshots, or completely unrelated pictures.
2. ACCEPT high-quality, professional, or directly relevant imagery (e.g. tech logos, charts, products, events).
3. Output a JSON object: { "selectedIndex": number_or_null, "reason": "brief explanation" }
4. If NO image is suitable, explicitly set "selectedIndex" to null! Only pick an image if it's genuinely good.

Article Content:
${articleContent.slice(0, 1500)}`;

    const contentArray: any[] = [
        { type: "text", text: promptText }
    ];

    uniqueUrls.forEach((url, i) => {
        contentArray.push({ type: "text", text: `Image [${i}]:` });
        contentArray.push({ type: "image_url", image_url: { url } });
    });

    try {
        const raw = await provider.createChatCompletion([
            { role: "user", content: contentArray },
        ], {
            model: "gpt-4o",
            temperature: 0.1,
            response_format: { type: "json_object" },
        });

        if (!raw) return null;
        const parsed = JSON.parse(raw);

        if (parsed.selectedIndex !== null && parsed.selectedIndex !== undefined && parsed.selectedIndex >= 0 && parsed.selectedIndex < uniqueUrls.length) {
            return uniqueUrls[parsed.selectedIndex];
        }
        return null;
    } catch (e) {
        console.error("[Synthesis] Vision filtering failed:", e);
        return null; // Fallback to no image instead of returning a bad meme
    }
}

export async function generateFallbackImage(content: string, settings?: SynthesisSettings): Promise<string | null> {
    try {
        const apiKey = process.env.OPENAI_API_KEY || settings?.aiApiKey;
        if (!apiKey) {
            return null; // Don't crash if no API key is available
        }

        // 1. Generate prompts based on content
        const provider = getWorkspaceProvider(settings, "gpt-4o", "OPENAI");

        const systemPrompt = `### ROLE
Professional HK Photographer (iPhone 15 Pro).

### CORE DIRECTIVE
Analyze the source content and identify 4 distinct visual moments. Generate 4 separate image prompts.

### PHOTOGRAPHY STYLE RULES

### OUTPUT FORMAT (STRICT)
Return a single JSON object containing an array of 4 prompts. 
Do not include markdown backticks (\`\`\`json). 
Do not include any intro or outro text.`;

        const userPrompt = `### SOURCE CONTENT
${content.slice(0, 3000)}

### EXECUTION
Follow the Style Rules to create 4 unique iPhone 15 Pro prompts based on the content above.`;

        let imagePromptText = "Professional editorial tech illustration, clean modern corporate aesthetic.";
        try {
            const rawFormat = await provider.createChatCompletion([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ], {
                model: "gpt-4o",
                temperature: 0.7,
                response_format: { type: "json_object" }
            });

            if (rawFormat) {
                const parsed = JSON.parse(rawFormat);
                for (const key of Object.keys(parsed)) {
                    if (Array.isArray(parsed[key]) && parsed[key].length > 0) {
                        imagePromptText = parsed[key][0];
                        break;
                    }
                }
            }
        } catch (promptErr) {
            console.error("[Synthesis] Failed to generate image prompts:", promptErr);
        }

        console.log(`  -> Gemini image prompt: ${imagePromptText}`);

        // 1. Try Gemini (gemini-3-pro-image-preview)
        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (geminiApiKey) {
            try {
                const genAI = new GoogleGenerativeAI(geminiApiKey);
                const model = genAI.getGenerativeModel({ model: "gemini-3-pro-image-preview" });
                const result = await model.generateContent(imagePromptText);
                const candidates = result?.response?.candidates;
                const part = candidates?.[0]?.content?.parts?.find(p => p.inlineData);
                if (part?.inlineData) {
                    const buffer = Buffer.from(part.inlineData.data, 'base64');
                    const filename = `generated/${Date.now()}_gemini.png`;
                    return await uploadBufferToStorage(buffer, filename, 'image/png');
                }
            } catch (geminiErr: any) {
                console.warn(`[Synthesis] Gemini image generation failed: ${geminiErr.message}`);
            }
        }

        // 2. Fallback to DALL-E 3
        const openaiApiKey = process.env.OPENAI_API_KEY || settings?.aiApiKey;
        if (openaiApiKey) {
            const client = new OpenAI({ apiKey: openaiApiKey });
            try {
                const response = await client.images.generate({
                    model: "dall-e-3",
                    prompt: imagePromptText,
                    n: 1,
                    size: "1024x1024"
                });
                return response?.data?.[0]?.url || null;
            } catch (dalleErr: any) {
                console.error("[Synthesis] DALL-E 3 fallback failed:", dalleErr.message);
            }
        }

        return null;
    } catch (e: any) {
        console.error("[Synthesis] Both image generation attempts failed:", e.message || e);
        return null;
    }
}

// Allow running directly via `tsx lib / synthesis_engine.ts`
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
