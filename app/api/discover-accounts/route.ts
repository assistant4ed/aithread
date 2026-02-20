import { NextRequest, NextResponse } from "next/server";
import Groq from "groq-sdk";

// Lazy-load Groq to avoid top-level env-var errors
let groqInstance: Groq | null = null;
function getGroq() {
    if (!groqInstance) {
        if (!process.env.GROQ_API_KEY) {
            throw new Error("GROQ_API_KEY is missing");
        }
        groqInstance = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return groqInstance;
}

/**
 * Validates a Threads handle by checking if its profile page 
 * has the generic "Log in" title (invalid) or a real name (valid).
 */
async function validateThreadsHandle(handle: string): Promise<boolean> {
    try {
        const url = `https://www.threads.net/@${handle}`;
        // Using a crawler User-Agent helps get the social meta tags populated
        const response = await fetch(url, {
            headers: {
                "User-Agent": "facebookexternalhit/1.1",
            },
            next: { revalidate: 3600 } // Cache results for an hour
        });
        const html = await response.text();

        // Check for common fallback/error titles
        if (html.includes("<title>Threads • Log in</title>") ||
            html.includes("content=\"Threads • Log in\"") ||
            (html.includes("Say more") && html.includes("<title>Threads</title>"))) {
            return false;
        }

        // Check if the handle (with @ or encoded) exists in the title/meta
        const lowerHandle = handle.toLowerCase();
        if (html.toLowerCase().includes(`(@${lowerHandle})`) ||
            html.includes(`&#064;${lowerHandle}`)) {
            return true;
        }

        return false;
    } catch (e) {
        console.error(`[Discovery] Validation error for @${handle}:`, e);
        return false;
    }
}

export async function POST(req: NextRequest) {
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

        const completion = await getGroq().chat.completions.create({
            messages: [
                { role: "system", content: systemPrompt },
            ],
            model: "llama-3.3-70b-versatile",
            temperature: 0.7,
            response_format: { type: "json_object" },
        });

        const raw = completion.choices[0]?.message?.content;
        if (!raw) {
            return NextResponse.json({ error: "LLM generation failed" }, { status: 500 });
        }

        const parsed = JSON.parse(raw);
        const potentialHandles: string[] = parsed.handles || [];

        console.log(`[Discovery] Generated ${potentialHandles.length} potential handles. Validating...`);

        // Concurrently validate all handles
        const results = await Promise.all(
            potentialHandles.map(async (handle) => {
                const isValid = await validateThreadsHandle(handle);
                return isValid ? handle : null;
            })
        );

        const validHandles = results.filter((h): h is string => h !== null);

        console.log(`[Discovery] Validation complete. ${validHandles.length}/${potentialHandles.length} valid.`);

        return NextResponse.json({ handles: validHandles });

    } catch (error: any) {
        console.error("Discovery error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
