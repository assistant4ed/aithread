import { prisma } from "./prisma";
import { tavilySearch } from "./tavily_client";
import { getWorkspaceProvider, translateText, synthesizeCluster, checkAutoApproval } from "./synthesis_engine";
import { POST_FORMATS } from "./postFormats";
import { startGeneration, updateProgress, completeGeneration, failGeneration } from "./generation_tracker";

/**
 * Content Generation Modes — Backend Logic
 * 
 * Each workspace operates in one of 5 modes:
 * - SCRAPE (default): existing scrape → synthesis → publish pipeline
 * - REFERENCE: creates content inspired by a reference workspace's articles
 * - SEARCH: web search (Tavily) + optional News API for real-time content
 * - VARIATIONS: generates N variations of the same base topics
 * - AUTO_DISCOVER: system discovers trending content for a niche automatically
 */

interface WorkspaceWithMode {
    id: string;
    contentMode: string;
    synthesisPrompt: string | null;
    translationPrompt: string;
    synthesisLanguage: string;
    aiProvider: string;
    aiModel: string;
    aiApiKey: string | null;
    preferredFormats: string[];
    newsApiKey: string | null;
    dataCollationHours: number;
    referenceWorkspaceId: string | null;
    autoDiscoverNiche: string | null;
    variationBaseTopics: string[];
    variationCount: number;
    topicFilter: string | null;
    autoApproveDrafts: boolean;
    autoApprovePrompt: string | null;
}

/**
 * Pick a format with rotation logic to ensure variety.
 * Avoids recently used formats and weights by user preferences.
 */
async function pickFormat(workspace: WorkspaceWithMode): Promise<string> {
    const prefs = workspace.preferredFormats || [];
    const validFormats = prefs.length > 0
        ? prefs.filter(f => POST_FORMATS[f])
        : Object.keys(POST_FORMATS);

    if (validFormats.length === 0) {
        return Object.keys(POST_FORMATS)[0]; // Fallback
    }

    // Get last 10 articles to see recently used formats
    const recentArticles = await prisma.synthesizedArticle.findMany({
        where: { workspaceId: workspace.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { formatUsed: true }
    });

    const recentlyUsed = recentArticles
        .map(a => a.formatUsed)
        .filter(Boolean) as string[];

    // Count usage frequency
    const usageCount: Record<string, number> = {};
    for (const format of recentlyUsed) {
        usageCount[format] = (usageCount[format] || 0) + 1;
    }

    // Weight formats inversely by recent usage
    const weights: Record<string, number> = {};
    for (const format of validFormats) {
        const usage = usageCount[format] || 0;
        // Less used = higher weight
        weights[format] = Math.max(1, 10 - usage);
    }

    // Weighted random selection
    const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;

    for (const format of validFormats) {
        random -= weights[format];
        if (random <= 0) {
            return format;
        }
    }

    // Fallback
    return validFormats[0];
}

// ─── Mode 1: REFERENCE ──────────────────────────────────────────────────────

/**
 * Generate content inspired by a reference workspace's recent articles.
 */
export async function generateReferenceContent(workspace: WorkspaceWithMode, topic?: string, runId?: string): Promise<{ success: boolean; article?: any; error?: string }> {
    if (!workspace.referenceWorkspaceId) {
        return { success: false, error: "No reference workspace configured." };
    }

    if (runId) {
        await updateProgress(runId, {
            status: "DISCOVERING",
            currentStep: 1,
            progress: 10
        });
    }

    // Fetch recent published articles from the reference workspace
    const referenceArticles = await prisma.synthesizedArticle.findMany({
        where: {
            workspaceId: workspace.referenceWorkspaceId,
            status: "PUBLISHED",
        },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
            topicName: true,
            articleContent: true,
            articleOriginal: true,
            formatUsed: true,
        }
    });

    if (referenceArticles.length === 0) {
        return { success: false, error: "Reference workspace has no published articles to draw inspiration from." };
    }

    const provider = getWorkspaceProvider(workspace as any);
    const formatId = await pickFormat(workspace);
    const format = POST_FORMATS[formatId] || POST_FORMATS["LISTICLE"];

    const referenceContext = referenceArticles.map((a, i) =>
        `Reference #${i + 1}: "${a.topicName}"\nFormat: ${a.formatUsed || 'LISTICLE'}\nContent: ${(a.articleOriginal || a.articleContent).slice(0, 500)}`
    ).join("\n\n---\n\n");

    const prompt = `${workspace.synthesisPrompt || "You are a viral social media editor."}

You are creating NEW, ORIGINAL content inspired by the style and topics of these reference articles.
${topic ? `Focus on this specific topic: "${topic}"` : "Choose a relevant trending topic based on the reference content."}

## REFERENCE ARTICLES (for style/topic inspiration only)
${referenceContext}

## OUTPUT FORMAT: ${format.id}
**Structure:** ${format.structure}
**Style:** ${format.description}
**Best For:** ${format.bestFor || "General use"}
**Tone:** ${format.tone || "Professional"}

**Visual Template:**
${format.visualExample || "Standard format"}

## FORMAT GUIDELINES
- Follow the structure EXACTLY as specified
- Match the tone and style described
- Use the visual template as a guide for layout
- Ensure each section is clearly defined
${format.id === 'LISTICLE' ? '- Number items 1-7 max, each with clear value' : ''}
${format.id === 'HOT_TAKE' ? '- Lead with the boldest claim, then support it' : ''}
${format.id === 'THREAD_STORM' ? '- Use 1/, 2/, 3/ format for thread numbering' : ''}

## RULES
1. Create ENTIRELY NEW content — do NOT copy or paraphrase the reference articles
2. Match the tone, style, and general topic area of the references
3. Adhere strictly to the format structure
4. Output JSON: { "headline": "...", "content": "..." }
5. JSON ONLY.`;

    try {
        const raw = await provider.createChatCompletion([
            { role: "system", content: "You are a creative content generator. Always output valid JSON." },
            { role: "user", content: prompt }
        ], {
            model: workspace.aiModel,
            temperature: 0.7,
            response_format: { type: "json_object" }
        });

        if (!raw) return { success: false, error: "AI returned empty response." };

        const parsed = JSON.parse(raw);
        let headline = parsed.headline || "Generated Article";
        let content = parsed.content || "";

        if (!content) return { success: false, error: "AI generated empty content." };

        // Translate if needed
        const needsTranslation = workspace.synthesisLanguage?.toLowerCase() !== "english";
        if (needsTranslation) {
            const styleGuide = workspace.translationPrompt ? ` Style guide: "${workspace.translationPrompt}"` : "";
            headline = await translateText(headline, `Translate to ${workspace.synthesisLanguage}.${styleGuide} Output ONLY the translated text.`, workspace as any);
            content = await translateText(content, `Translate to ${workspace.synthesisLanguage}.${styleGuide} Keep markdown formatting. Output ONLY the translated text.`, workspace as any);
        }

        // Auto-approval check
        let finalStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED" = "PENDING_REVIEW";
        let rejectionReason: string | undefined = undefined;

        if (workspace.autoApproveDrafts) {
            console.log(`  -> Auto-approving reference article...`);
            const result = await checkAutoApproval(
                headline,
                content,
                workspace.autoApprovePrompt || "Approve if the content is relevant and logically coherent. Reject spam, irrelevant content, or incoherent text.",
                workspace as any
            );
            finalStatus = result.approved ? "APPROVED" : "REJECTED";
            rejectionReason = result.reason;
            console.log(`  -> Auto-approval result: ${finalStatus}${rejectionReason ? ` (${rejectionReason})` : ''}`);
        }

        const article = await prisma.synthesizedArticle.create({
            data: {
                workspaceId: workspace.id,
                topicName: headline,
                articleContent: content,
                articleOriginal: parsed.content,
                authorCount: 0,
                postCount: 0,
                status: finalStatus,
                sourcePostIds: [],
                sourceAccounts: [`ref:${workspace.referenceWorkspaceId}`],
                formatUsed: formatId,
                externalUrls: [],
                rejectionReason,
            }
        });

        return { success: true, article };
    } catch (e: any) {
        console.error("[ContentModes/REFERENCE] Error:", e);
        return { success: false, error: e.message };
    }
}

// ─── Mode 2: SEARCH ─────────────────────────────────────────────────────────

/**
 * Search web (Tavily primary + optional NewsAPI) and generate content.
 */
export async function generateSearchContent(workspace: WorkspaceWithMode, topic: string, runId?: string): Promise<{ success: boolean; article?: any; error?: string }> {
    if (!topic) return { success: false, error: "Topic is required for SEARCH mode." };

    if (runId) {
        await updateProgress(runId, {
            status: "SYNTHESIZING",
            currentStep: 2,
            progress: 40,
            currentTopic: topic
        });
    }

    const provider = getWorkspaceProvider(workspace as any);
    const formatId = await pickFormat(workspace);
    const format = POST_FORMATS[formatId] || POST_FORMATS["LISTICLE"];

    // 1. Tavily search (primary)
    let searchContext = "";
    let externalUrls: string[] = [];

    const tavilyKey = process.env.TAVILY_API_KEY;
    if (tavilyKey) {
        try {
            const results = await tavilySearch(tavilyKey, `Latest news on ${topic} today`, {
                searchDepth: "advanced",
                includeAnswers: true,
                maxResults: 6,
            });

            if (results.results?.length) {
                externalUrls = results.results.map((r) => r.url);
                searchContext += results.results.map((r) =>
                    `Source: ${r.title}\nURL: ${r.url}\nSummary: ${r.content}`
                ).join("\n---\n");
            }
        } catch (e: any) {
            console.warn("[ContentModes/SEARCH] Tavily search failed:", e.message);
        }
    }

    // 2. NewsAPI (optional secondary)
    const newsApiKey = workspace.newsApiKey || process.env.NEWS_API_KEY;
    if (newsApiKey) {
        try {
            const sinceDate = new Date(Date.now() - workspace.dataCollationHours * 3600000);
            const fromDate = sinceDate.toISOString().split("T")[0];
            const url = `https://newsapi.org/v2/everything?q=${encodeURIComponent(topic)}&from=${fromDate}&sortBy=relevancy&pageSize=5&apiKey=${newsApiKey}`;
            const res = await fetch(url);
            const data = await res.json();

            if (data.articles?.length) {
                searchContext += "\n\n--- NEWS API RESULTS ---\n\n";
                searchContext += data.articles.map((a: any) =>
                    `Source: ${a.title} (${a.source?.name || "Unknown"})\nURL: ${a.url}\nSummary: ${a.description || ""}`
                ).join("\n---\n");
                externalUrls.push(...data.articles.map((a: any) => a.url).filter(Boolean));
            }
        } catch (e: any) {
            console.warn("[ContentModes/SEARCH] NewsAPI failed:", e.message);
        }
    }

    if (!searchContext) {
        return { success: false, error: "No search results found from any source." };
    }

    // 3. Synthesize
    const systemPrompt = workspace.synthesisPrompt || "You are a professional news editor. Write a clear, engaging summary.";
    const synthesisPrompt = `${systemPrompt}

Based on the following real-time search results, write a compelling article about "${topic}" using the ${format.id} format.

## OUTPUT FORMAT: ${format.id}
**Structure:** ${format.structure}
**Style:** ${format.description}
**Best For:** ${format.bestFor || "General use"}
**Tone:** ${format.tone || "Professional"}

**Visual Template:**
${format.visualExample || "Standard format"}

## FORMAT GUIDELINES
- Follow the structure EXACTLY as specified
- Match the tone and style described
- Use the visual template as a guide for layout
- Cite sources naturally within the content where relevant
${format.id === 'DATA_STORY' ? '- Lead with the most surprising statistic' : ''}
${format.id === 'NEWS_FLASH' ? '- Keep it punchy and urgent' : ''}
${format.id === 'EXPLAINER' ? '- Start with what people are confused about' : ''}

Output JSON: { "headline": "A catchy headline", "content": "Full article in markdown" }
JSON ONLY.

## Search Results
${searchContext.slice(0, 15000)}`;

    try {
        const raw = await provider.createChatCompletion([
            { role: "system", content: "You are a helpful news assistant. Always output valid JSON." },
            { role: "user", content: synthesisPrompt }
        ], {
            model: workspace.aiModel,
            temperature: 0.5,
            response_format: { type: "json_object" }
        });

        if (!raw) return { success: false, error: "AI returned empty response." };

        const parsed = JSON.parse(raw);
        let headline = parsed.headline || `${topic} News`;
        let content = parsed.content || "";

        if (!content) return { success: false, error: "AI generated empty content." };

        // Translate if needed
        const needsTranslation = workspace.synthesisLanguage?.toLowerCase() !== "english";
        if (needsTranslation) {
            const styleGuide = workspace.translationPrompt ? ` Style guide: "${workspace.translationPrompt}"` : "";
            headline = await translateText(headline, `Translate to ${workspace.synthesisLanguage}.${styleGuide} Output ONLY the translated text.`, workspace as any);
            content = await translateText(content, `Translate to ${workspace.synthesisLanguage}.${styleGuide} Keep markdown formatting. Output ONLY the translated text.`, workspace as any);
        }

        // Auto-approval check
        let finalStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED" = "PENDING_REVIEW";
        let rejectionReason: string | undefined = undefined;

        if (workspace.autoApproveDrafts) {
            console.log(`  -> Auto-approving article for topic "${topic}"...`);
            const result = await checkAutoApproval(
                headline,
                content,
                workspace.autoApprovePrompt || "Approve if the content is relevant and logically coherent. Reject spam, irrelevant content, or incoherent text.",
                workspace as any
            );
            finalStatus = result.approved ? "APPROVED" : "REJECTED";
            rejectionReason = result.reason;
            console.log(`  -> Auto-approval result: ${finalStatus}${rejectionReason ? ` (${rejectionReason})` : ''}`);
        }

        const article = await prisma.synthesizedArticle.create({
            data: {
                workspaceId: workspace.id,
                topicName: headline,
                articleContent: content,
                articleOriginal: parsed.content,
                authorCount: 0,
                postCount: 0,
                status: finalStatus,
                sourcePostIds: [],
                sourceAccounts: ["Tavily Search API", newsApiKey ? "NewsAPI" : ""].filter(Boolean),
                formatUsed: formatId,
                externalUrls,
                rejectionReason,
            }
        });

        return { success: true, article };
    } catch (e: any) {
        console.error("[ContentModes/SEARCH] Error:", e);
        return { success: false, error: e.message };
    }
}

// ─── Mode 3: VARIATIONS ─────────────────────────────────────────────────────

/**
 * Generate N variations of content for each base topic.
 */
export async function generateVariations(workspace: WorkspaceWithMode, specificTopic?: string, runId?: string): Promise<{ success: boolean; articles?: any[]; error?: string }> {
    const topics = specificTopic ? [specificTopic] : workspace.variationBaseTopics;
    if (!topics || topics.length === 0) {
        return { success: false, error: "No base topics configured for VARIATIONS mode." };
    }

    if (runId) {
        await updateProgress(runId, {
            status: "SYNTHESIZING",
            currentStep: 1,
            progress: 20
        });
    }

    const provider = getWorkspaceProvider(workspace as any);
    const count = workspace.variationCount || 3;
    const allArticles: any[] = [];

    // Define angle archetypes for diversity
    const angles = [
        { name: "Optimistic", instruction: "Focus on opportunities, benefits, and positive outcomes. Be enthusiastic and forward-looking." },
        { name: "Cautious", instruction: "Highlight challenges, risks, and potential downsides. Be balanced and consider trade-offs." },
        { name: "Educational", instruction: "Explain concepts clearly, provide context, and help readers understand. Be informative and accessible." },
        { name: "Actionable", instruction: "Give concrete steps, practical advice, and immediate takeaways. Be directive and useful." },
        { name: "Analytical", instruction: "Break down the topic with data, comparisons, and logical reasoning. Be objective and evidence-based." },
        { name: "Storytelling", instruction: "Use narrative, examples, and real-world cases. Be engaging and relatable." }
    ];

    for (const topic of topics) {
        // Pick different formats for each variation to ensure diversity
        const availableFormats = workspace.preferredFormats?.length > 0
            ? workspace.preferredFormats.filter(f => POST_FORMATS[f])
            : Object.keys(POST_FORMATS);

        // Select diverse angles for variations
        const selectedAngles = angles.slice(0, Math.min(count, angles.length));

        const prompt = `${workspace.synthesisPrompt || "You are a viral social media editor."}

Generate ${count} COMPLETELY DIFFERENT variations of a social media post about: "${topic}"

Each variation MUST have a distinct angle and perspective:
${selectedAngles.map((angle, i) => `${i + 1}. ${angle.name} Angle: ${angle.instruction}`).join('\n')}

Each variation should:
- Match the assigned angle/perspective exactly
- Use a different format from this list: ${availableFormats.slice(0, count).map(f => `${f} (${POST_FORMATS[f]?.description})`).join(", ")}
- Have a unique hook and structure
- Be ready to publish as-is

Output JSON: { "variations": [{ "angle": "Optimistic", "headline": "...", "content": "...", "format": "FORMAT_ID" }, ...] }
Ensure each variation truly reflects its assigned angle.
JSON ONLY.`;

        try {
            const raw = await provider.createChatCompletion([
                { role: "system", content: "You are a creative content variation generator. Always output valid JSON." },
                { role: "user", content: prompt }
            ], {
                model: workspace.aiModel,
                temperature: 0.85, // Slightly higher for more diversity
                response_format: { type: "json_object" }
            });

            if (!raw) continue;
            const parsed = JSON.parse(raw);
            const variations = parsed.variations || [];

            for (const variation of variations) {
                let headline = variation.headline || topic;
                let content = variation.content || "";
                if (!content) continue;

                const needsTranslation = workspace.synthesisLanguage?.toLowerCase() !== "english";
                if (needsTranslation) {
                    const styleGuide = workspace.translationPrompt ? ` Style guide: "${workspace.translationPrompt}"` : "";
                    headline = await translateText(headline, `Translate to ${workspace.synthesisLanguage}.${styleGuide} Output ONLY the translated text.`, workspace as any);
                    content = await translateText(content, `Translate to ${workspace.synthesisLanguage}.${styleGuide} Keep markdown formatting. Output ONLY the translated text.`, workspace as any);
                }

                // Auto-approval check
                let finalStatus: "PENDING_REVIEW" | "APPROVED" | "REJECTED" = "PENDING_REVIEW";
                let rejectionReason: string | undefined = undefined;

                if (workspace.autoApproveDrafts) {
                    console.log(`  -> Auto-approving variation: ${variation.angle || 'Default'}...`);
                    const result = await checkAutoApproval(
                        headline,
                        content,
                        workspace.autoApprovePrompt || "Approve if the content is relevant and logically coherent. Reject spam, irrelevant content, or incoherent text.",
                        workspace as any
                    );
                    finalStatus = result.approved ? "APPROVED" : "REJECTED";
                    rejectionReason = result.reason;
                    console.log(`  -> Auto-approval result: ${finalStatus}${rejectionReason ? ` (${rejectionReason})` : ''}`);
                }

                const article = await prisma.synthesizedArticle.create({
                    data: {
                        workspaceId: workspace.id,
                        topicName: `${headline} [${variation.angle || 'Variation'}]`,
                        articleContent: content,
                        articleOriginal: variation.content,
                        authorCount: 0,
                        postCount: 0,
                        status: finalStatus,
                        sourcePostIds: [],
                        sourceAccounts: [`variation:${topic} (${variation.angle || 'Default'})`],
                        formatUsed: variation.format || await pickFormat(workspace),
                        externalUrls: [],
                        rejectionReason,
                    }
                });
                allArticles.push(article);
            }

            console.log(`[ContentModes/VARIATIONS] Generated ${variations.length} variations for "${topic}"`);
        } catch (e: any) {
            console.error(`[ContentModes/VARIATIONS] Error for topic "${topic}":`, e);
        }
    }

    if (allArticles.length === 0) {
        return { success: false, error: "Failed to generate any variations." };
    }

    return { success: true, articles: allArticles };
}

// ─── Mode 4: AUTO_DISCOVER ──────────────────────────────────────────────────

/**
 * Automatically discover trending topics for a niche and generate content.
 */
export async function generateAutoDiscoverContent(workspace: WorkspaceWithMode): Promise<{ success: boolean; articles?: any[]; error?: string }> {
    if (!workspace.autoDiscoverNiche) {
        return { success: false, error: "No niche description configured for AUTO_DISCOVER mode." };
    }

    // Start tracking (5 steps: discover, generate queries, search, synthesize, translate)
    const runId = await startGeneration(workspace.id, 5);

    try {
        await updateProgress(runId, {
            status: "DISCOVERING",
            currentStep: 1,
            progress: 0,
            metadata: { niche: workspace.autoDiscoverNiche }
        });

        const provider = getWorkspaceProvider(workspace as any);

        // Step 1: Use Tavily to discover trending topics in the niche
        const tavilyKey = process.env.TAVILY_API_KEY;
        let discoveredTopics: { topic: string; signal: string; relevance: number }[] = [];

        if (tavilyKey) {
            try {
                await updateProgress(runId, {
                    currentStep: 1,
                    progress: 10,
                    metadata: { stage: "Searching Tavily for trending topics..." }
                });

                const trendResults = await tavilySearch(tavilyKey, `Latest trending topics in ${workspace.autoDiscoverNiche} last 48 hours`, {
                    searchDepth: "advanced",
                    includeAnswers: true,
                    maxResults: 10,
                });

                if (trendResults.results?.length) {
                    // Extract topics from Tavily results
                    for (const result of trendResults.results.slice(0, 8)) {
                        discoveredTopics.push({
                            topic: result.title,
                            signal: result.content.slice(0, 200),
                            relevance: result.score || 0.5
                        });
                    }
                }

                await updateProgress(runId, {
                    progress: 20,
                    metadata: { topicsFound: discoveredTopics.length }
                });
            } catch (e: any) {
                console.warn("[ContentModes/AUTO_DISCOVER] Tavily discovery failed:", e.message);
            }
        }

        // Step 2: If Tavily didn't find enough, use AI to generate queries
        if (discoveredTopics.length < 3) {
            await updateProgress(runId, {
                status: "SYNTHESIZING",
                currentStep: 2,
                progress: 30,
                metadata: { stage: "Generating additional trending queries with AI..." }
            });

            const discoveryPrompt = `You are a social media trend analyst specializing in "${workspace.autoDiscoverNiche}".

Today is ${new Date().toLocaleDateString()}. Generate 5 specific, trending search queries that would find the most viral/newsworthy content happening RIGHT NOW in this niche.

Focus on:
- Breaking news from the last 48 hours
- Viral announcements or product launches
- Controversial takes or ongoing debates
- Surprising data, research, or statistics
- Rising tools/technologies gaining traction

Output JSON: { "queries": ["specific query 1", "specific query 2", ...] }
Each query should be specific enough to find real, recent content.
JSON ONLY.`;

            let queries: string[] = [];
            try {
                const raw = await provider.createChatCompletion([
                    { role: "system", content: "You are a trend research assistant. Output valid JSON." },
                    { role: "user", content: discoveryPrompt }
                ], {
                    model: workspace.aiModel,
                    temperature: 0.7,
                    response_format: { type: "json_object" }
                });

                if (raw) {
                    const parsed = JSON.parse(raw);
                    queries = parsed.queries || [];
                }
            } catch (e: any) {
                console.warn("[ContentModes/AUTO_DISCOVER] Query generation failed:", e.message);
            }

            // Convert queries to topics
            for (const query of queries.slice(0, 5 - discoveredTopics.length)) {
                discoveredTopics.push({
                    topic: query,
                    signal: "AI-suggested trending query",
                    relevance: 0.6
                });
            }
        }

        if (discoveredTopics.length === 0) {
            // Ultimate fallback: use the niche description directly
            discoveredTopics.push({
                topic: workspace.autoDiscoverNiche,
                signal: "Fallback to niche description",
                relevance: 0.5
            });
        }

        // Step 3: Sort by relevance and generate articles for top topics
        discoveredTopics.sort((a, b) => b.relevance - a.relevance);
        const allArticles: any[] = [];
        const maxArticles = 5; // Increased from 3 to 5

        const topicsToProcess = discoveredTopics.slice(0, Math.min(discoveredTopics.length, 8));

        // Calculate actual articles we'll generate (limited by maxArticles)
        const articlesToGenerate = Math.min(topicsToProcess.length, maxArticles);

        // Update totalSteps now that we know how many articles we'll generate
        await updateProgress(runId, {
            currentStep: 3,
            totalSteps: 3 + articlesToGenerate, // Discovery (3 steps) + actual articles to generate
            progress: 40,
            metadata: { topicsToGenerate: articlesToGenerate }
        });

        console.log(`[ContentModes/AUTO_DISCOVER] Discovered ${discoveredTopics.length} topics, generating up to ${maxArticles} articles`);

        let topicIndex = 0;

        for (const { topic } of topicsToProcess) {
            if (allArticles.length >= maxArticles) break;

            topicIndex++;
            const progressPct = 40 + Math.floor((topicIndex / articlesToGenerate) * 50);

            await updateProgress(runId, {
                status: "SYNTHESIZING",
                currentStep: 3 + topicIndex,
                progress: progressPct,
                currentTopic: topic,
                articlesCreated: allArticles.length
            });

            console.log(`[ContentModes/AUTO_DISCOVER] Generating article ${topicIndex}/${articlesToGenerate}: "${topic}"`);
            const result = await generateSearchContent(workspace, topic);
            if (result.success && result.article) {
                allArticles.push(result.article);
            }

            // Small delay to avoid rate limits
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        if (allArticles.length === 0) {
            await failGeneration(runId, "Could not discover and generate any content for this niche.");
            return { success: false, error: "Could not discover and generate any content for this niche. Try adjusting your niche description to be more specific." };
        }

        await completeGeneration(runId, allArticles.length);
        console.log(`[ContentModes/AUTO_DISCOVER] Successfully generated ${allArticles.length} articles`);
        return { success: true, articles: allArticles };

    } catch (error: any) {
        await failGeneration(runId, error.message || String(error));
        throw error;
    }
}

// ─── Mode Router ────────────────────────────────────────────────────────────

/**
 * Main entry point: routes a generation request to the correct mode handler.
 */
export async function generateByMode(workspaceId: string, topic?: string): Promise<{ success: boolean; articles?: any[]; article?: any; error?: string }> {
    const workspace = await prisma.workspace.findUnique({
        where: { id: workspaceId }
    });

    if (!workspace) return { success: false, error: "Workspace not found" };

    const ws = workspace as unknown as WorkspaceWithMode;

    console.log(`[ContentModes] Generating for workspace "${workspace.name}" in mode: ${ws.contentMode}`);
    console.log(`[ContentModes] AI Config: provider=${ws.aiProvider}, model=${ws.aiModel}, hasApiKey=${!!ws.aiApiKey}`);

    // AUTO_DISCOVER has its own internal tracking
    if (ws.contentMode === "AUTO_DISCOVER") {
        return generateAutoDiscoverContent(ws);
    }

    // For other modes, wrap with tracking
    const runId = await startGeneration(workspaceId, 3);

    try {
        let result;

        switch (ws.contentMode) {
            case "REFERENCE":
                result = await generateReferenceContent(ws, topic, runId);
                break;

            case "SEARCH":
                if (!topic) return { success: false, error: "Topic is required for SEARCH mode." };
                result = await generateSearchContent(ws, topic, runId);
                break;

            case "VARIATIONS":
                result = await generateVariations(ws, topic, runId);
                break;

            case "SCRAPE":
            default:
                // For SCRAPE mode, use the original generate-article flow (Tavily-only)
                if (!topic) return { success: false, error: "Topic is required." };
                result = await generateSearchContent(ws, topic, runId);
                break;
        }

        if (result.success) {
            const count = ('articles' in result && result.articles)
                ? result.articles.length
                : ('article' in result && result.article ? 1 : 0);
            await completeGeneration(runId, count);
        } else {
            await failGeneration(runId, result.error || "Unknown error");
        }

        return result;

    } catch (error: any) {
        await failGeneration(runId, error.message || String(error));
        throw error;
    }
}
