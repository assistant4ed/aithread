import { NextResponse } from "next/server";
import { prisma } from "../../../../../lib/prisma";
import { tavily } from "@tavily/core";
import { getWorkspaceProvider } from "../../../../../lib/synthesis_engine";
import { translateText } from "../../../../../lib/synthesis_engine";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: workspaceId } = await params;
        const { topic } = await jsonOrNull(req);

        if (!topic) {
            return NextResponse.json({ error: "Topic is required" }, { status: 400 });
        }

        const workspace = await prisma.workspace.findUnique({
            where: { id: workspaceId }
        });

        if (!workspace) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        // 1. Search the web using Tavily
        const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });
        let searchResults;
        try {
            console.log(`[AI Generator] Searching Tavily for: ${topic}`);
            searchResults = await tvly.search(`Latest news on ${topic} today`, {
                searchDepth: "advanced",
                includeAnswers: true,
                maxResults: 6,
            });
        } catch (e: any) {
            console.error("[AI Generator] Tavily search failed:", e);
            return NextResponse.json({ error: "Failed to fetch realtime news. Is TAVILY_API_KEY set?" }, { status: 500 });
        }

        if (!searchResults.results || searchResults.results.length === 0) {
            return NextResponse.json({ error: "No recent news found for this topic." }, { status: 404 });
        }

        // Extract context and URLs
        const externalUrls = searchResults.results.map((r: any) => r.url);
        const contextLines = searchResults.results.map((r: any) =>
            `Source: ${r.title}\nURL: ${r.url}\nSummary: ${r.content}\n`
        ).join("\n---\n");

        // 2. Synthesize with LLM
        const provider = getWorkspaceProvider(workspace);
        const systemPrompt = workspace.synthesisPrompt || "You are a professional news editor. Write a clear, engaging summary of the following news updates.";

        const synthesisInstruction = `
${systemPrompt}

Based on the following real-time search results, write a comprehensive news article about "${topic}".

Format your response as a JSON object with two fields:
{
  "headline": "A catchy, accurate headline",
  "content": "The full article content in markdown format"
}

Search Results Context:
${contextLines}
`;

        console.log(`[AI Generator] Synthesizing article for topic: ${topic}`);
        const responseJsonStr = await provider.createChatCompletion([
            { role: "system", content: "You are a helpful news assistant. Always output valid JSON." },
            { role: "user", content: synthesisInstruction }
        ], {
            model: workspace.aiModel,
            temperature: 0.5,
            response_format: { type: "json_object" }
        });

        let headline = `${topic} News`;
        let content = "";

        try {
            const parsed = JSON.parse(responseJsonStr || "{}");
            headline = parsed.headline || headline;
            content = parsed.content || "Synthesis failed.";
        } catch (e) {
            console.error("[AI Generator] Failed to parse LLM JSON:", responseJsonStr);
            content = responseJsonStr || "Synthesis failed.";
        }

        // 3. Translate if needed
        const needsTranslation = workspace.synthesisLanguage && workspace.synthesisLanguage.toLowerCase() !== "english";
        let finalHeadline = headline;
        let finalContent = content;

        if (needsTranslation) {
            console.log(`[AI Generator] Translating to ${workspace.synthesisLanguage}...`);
            const translationInstruction = `Translate the following text to ${workspace.synthesisLanguage}. Keep the original markdown formatting intact.`;

            finalHeadline = await translateText(headline, translationInstruction, workspace);
            finalContent = await translateText(content, workspace.translationPrompt || translationInstruction, workspace);
        }

        // 4. Save directly as a SynthesizedArticle draft
        const article = await prisma.synthesizedArticle.create({
            data: {
                workspaceId,
                topicName: finalHeadline,
                articleContent: finalContent,
                articleOriginal: content,
                authorCount: 0, // Differentiates from scraped articles
                postCount: 0,   // Differentiates from scraped articles
                status: "PENDING_REVIEW",
                sourcePostIds: [],
                sourceAccounts: ["Tavily Search API"],
                externalUrls: externalUrls,
            }
        });

        console.log(`[AI Generator] Successfully created draft article ID: ${article.id}`);
        return NextResponse.json({ success: true, article });

    } catch (e: any) {
        console.error("[AI Generator] Error:", e);
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}

async function jsonOrNull(req: Request) {
    try {
        return await req.json();
    } catch {
        return {};
    }
}
