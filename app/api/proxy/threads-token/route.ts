
import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
    console.log("🔄 [Proxy] Received token exchange request");

    try {
        // Read form data (NextAuth sends x-www-form-urlencoded)
        const text = await req.text();
        console.log("📥 [Proxy] Request body (raw):", text);

        // Forward to Threads
        console.log("📡 [Proxy] Forwarding to Threads: https://graph.threads.net/oauth/access_token");
        const response = await fetch("https://graph.threads.net/oauth/access_token", {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
            },
            body: text,
        });

        const data = await response.json();
        console.log("📤 [Proxy] Threads response status:", response.status);
        console.log("📦 [Proxy] Threads response data:", JSON.stringify(data));

        if (!response.ok) {
            console.error("❌ [Proxy] Threads error details:", JSON.stringify(data));
            // Auth.js expects a conform response even for errors, but typically forwarding the status is fine
            return NextResponse.json(data, { status: response.status });
        }

        console.log("✅ [Proxy] Success! Patching response for NextAuth...");


        const patchedData = {
            ...data,
            token_type: data.token_type || "Bearer",
            expires_in: data.expires_in || 3600,
        };

        console.log("⬆️ [Proxy] Sending patched data to Auth.js:", JSON.stringify(patchedData));
        return NextResponse.json(patchedData);

    } catch (error: any) {
        console.error("💥 [Proxy] Internal error:", error);
        return NextResponse.json({ error: error.message, stack: error.stack }, { status: 500 });
    }
}
