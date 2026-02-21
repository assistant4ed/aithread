import { NextRequest, NextResponse } from "next/server";
import { getProvider } from "@/lib/ai/provider";
import { auth } from "@/auth";

const defaultProvider = getProvider({
    provider: "GROQ",
    model: "llama-3.3-70b-versatile",
});

/**
 * Validates a Threads handle by checking if its profile page 
 * has the generic "Log in" title (invalid) or a real name (valid).
 */
async function validateThreadsHandle(handle: string, retries = 2): Promise<boolean> {
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const url = `https://www.threads.net/@${handle}`;
            const response = await fetch(url, {
                headers: {
                    "User-Agent": "facebookexternalhit/1.1",
                },
                next: { revalidate: 3600 }
            });

            if (!response.ok) {
                if (response.status === 429 && attempt < retries) {
                    const delay = Math.pow(2, attempt) * 1000;
                    await new Promise(r => setTimeout(r, delay));
                    continue;
                }
                return false;
            }

            const html = await response.text();

            if (html.includes("<title>Threads • Log in</title>") ||
                html.includes("content=\"Threads • Log in\"") ||
                (html.includes("Say more") && html.includes("<title>Threads</title>"))) {
                return false;
            }

            const lowerHandle = handle.toLowerCase();
            return html.toLowerCase().includes(`(@${lowerHandle})`) ||
                html.includes(`&#064;${lowerHandle}`);

        } catch (e: any) {
            if (attempt < retries && (e.code === 'ETIMEDOUT' || e.message?.includes('fetch failed'))) {
                const delay = Math.pow(2, attempt) * 1000;
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            console.error(`[Discovery] Validation error for @${handle}:`, e);
            return false;
        }
    }
    return false;
}

export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { topic } = await req.json();

        if (!topic) {
            return NextResponse.json({ error: "Topic is required" }, { status: 400 });
        }

        console.log(`[Discovery] Hunting for accounts related to: ${topic}`);

        const systemPrompt = `
        You are a Social Media Discovery Engine.
        Task: Identify 40 highly relevant, active Threads/Instagram usernames related to the specific topic.
        
        Topic: "${topic}"

        Instructions:
        1. Brainstorm real influencers, companies, developers, and news outlets in this niche.
        2. Guess their likely Threads handles (usually same as Instagram/Twitter).
        3. Aim for high accuracy. 
        4. Focus on accounts that would post technical updates, news, or high-value insights.

        Output Format:
        Return a JSON object with a "handles" array of strings.
        Example: { "handles": ["zuck", "mosseri", "openai"] }

        JSON ONLY.
        `;

        const raw = await defaultProvider.createChatCompletion([
            { role: "system", content: systemPrompt },
        ], {
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            response_format: { type: "json_object" },
        });
        if (!raw) {
            return NextResponse.json({ error: "LLM generation failed" }, { status: 500 });
        }

        const parsed = JSON.parse(raw);
        const potentialHandles: string[] = parsed.handles || [];

        console.log(`[Discovery] Generated ${potentialHandles.length} potential handles. Validating in batches...`);

        // Validate handles in batches to avoid rate limits and timeouts
        const validHandles: string[] = [];
        const BATCH_SIZE = 5;

        for (let i = 0; i < potentialHandles.length; i += BATCH_SIZE) {
            const batch = potentialHandles.slice(i, i + BATCH_SIZE);
            const batchResults = await Promise.all(
                batch.map(async (handle) => {
                    const isValid = await validateThreadsHandle(handle);
                    return isValid ? handle : null;
                })
            );

            validHandles.push(...batchResults.filter((h): h is string => h !== null));

            // Small delay between batches to be respectful
            if (i + BATCH_SIZE < potentialHandles.length) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }

        console.log(`[Discovery] Validation complete. ${validHandles.length}/${potentialHandles.length} valid.`);

        return NextResponse.json({ handles: validHandles });

    } catch (error: any) {
        console.error("Discovery error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
