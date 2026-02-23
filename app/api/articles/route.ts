import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";
import { SynthesizedArticle } from "@prisma/client";

// GET /api/articles — query synthesized articles
export async function GET(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const workspaceId = searchParams.get("workspaceId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where: Record<string, any> = {};
    if (status) where.status = status;

    if (workspaceId) {
        const ws = await (prisma as any).workspace.findUnique({
            where: { id: workspaceId },
            select: { ownerId: true }
        });
        if (!ws || (ws.ownerId && ws.ownerId !== userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        where.workspaceId = workspaceId;
    } else {
        where.workspace = {
            OR: [
                { ownerId: userId },
                { ownerId: null }
            ]
        };
    }

    const [articles, total] = await Promise.all([
        (prisma as any).synthesizedArticle.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(limit, 100),
            skip: offset,
            include: {
                workspace: { select: { id: true, name: true } },
            },
        }),
        (prisma as any).synthesizedArticle.count({ where }),
    ]);

    const hydratedArticles = await Promise.all(articles.map(async (art: SynthesizedArticle) => {
        const sourcePosts = await prisma.post.findMany({
            where: { id: { in: art.sourcePostIds } },
            select: { id: true, mediaUrls: true, sourceAccount: true, sourceUrl: true }
        });

        let allMedia = Array.isArray(art.mediaUrls) ? art.mediaUrls : [];

        if (allMedia.length === 0) {
            allMedia = sourcePosts.flatMap(p => (Array.isArray(p.mediaUrls) ? p.mediaUrls : []));
        }

        return {
            ...art,
            mediaUrls: allMedia,
            sourceAccounts: art.sourceAccounts,
            sourcePosts: sourcePosts.map(p => ({
                id: p.id,
                sourceAccount: p.sourceAccount,
                sourceUrl: p.sourceUrl,
            })),
        };
    }));

    return NextResponse.json({ articles: hydratedArticles, total, limit, offset });
}
