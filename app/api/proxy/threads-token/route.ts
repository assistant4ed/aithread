
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    console.log("🔄 [Proxy] Received token exchange request");

    try {
        // Read form data (NextAuth sends x-www-form-urlencoded)
        const text = await req.text();
        console.log("📥 [Proxy] Request body:", text);

        // Forward to Threads
        // We use the raw text body to avoid messing up parsing
        const response = await fetch("https://graph.threads.net/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: text,
        });

        const data = await response.json();
        console.log("📤 [Proxy] Threads response status:", response.status);

        if (!response.ok) {
            console.error("❌ [Proxy] Threads error:", JSON.stringify(data));
            return NextResponse.json(data, { status: response.status });
        }

        console.log("✅ [Proxy] Success! Adding token_type field...");

        // Patch the response
        const patchedData = {
            ...data,
            token_type: "Bearer",
            expires_in: 3600, // Optional fallback
        };

        return NextResponse.json(patchedData);

    } catch (error: any) {
        console.error("💥 [Proxy] Internal error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
