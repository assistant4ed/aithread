import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getProvider } from "@/lib/ai/provider";

export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { provider, model, apiKey } = await request.json();

        if (!provider || !model) {
            return NextResponse.json({ error: "Provider and model are required" }, { status: 400 });
        }

        const ai = getProvider({ provider, model, apiKey: apiKey || undefined });

        const result = await ai.createChatCompletion(
            [
                { role: "system", content: "Reply with exactly: OK" },
                { role: "user", content: "Test" },
            ],
            { temperature: 0, max_tokens: 10 }
        );

        if (result) {
            return NextResponse.json({ success: true, message: `Connected to ${provider} (${model}) successfully.` });
        } else {
            return NextResponse.json({ success: false, message: "API returned empty response." }, { status: 500 });
        }
    } catch (err: any) {
        const message = err.message || "Unknown error";
        return NextResponse.json({ success: false, message: `Connection failed: ${message}` }, { status: 500 });
    }
}
