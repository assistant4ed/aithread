import { NextResponse } from "next/server";
import { generateByMode } from "../../../../../lib/content_modes";

export async function POST(
    req: Request,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: workspaceId } = await params;
        const { topic } = await jsonOrNull(req);

        const result = await generateByMode(workspaceId, topic);

        if (!result.success) {
            return NextResponse.json(
                { error: result.error || "Generation failed" },
                { status: result.error?.includes("not found") ? 404 : 400 }
            );
        }

        // Return either a single article or multiple articles
        return NextResponse.json({
            success: true,
            article: result.article || result.articles?.[0],
            articles: result.articles,
            count: result.articles?.length || 1,
        });
    } catch (e: any) {
        console.error("[Generate Article] Error:", e);
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
