
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/articles — query synthesized articles
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const workspaceId = searchParams.get("workspaceId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (workspaceId) where.workspaceId = workspaceId;

    const [articles, total] = await Promise.all([
        prisma.synthesizedArticle.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(limit, 100),
            skip: offset,
            include: {
                workspace: { select: { id: true, name: true } },
            },
        }),
        prisma.synthesizedArticle.count({ where }),
    ]);

    // Hydrate source posts for media display if needed
    // For the list view, we might want to just pick the first image from source posts?
    // Let's do a quick lookup for media URLs for these articles.
    const hydratedArticles = await Promise.all(articles.map(async (art) => {
        let allMedia = Array.isArray(art.mediaUrls) ? art.mediaUrls : [];

        // If stored media is empty, hydrate from source posts
        if (allMedia.length === 0) {
            const sourcePosts = await prisma.post.findMany({
                where: { id: { in: art.sourcePostIds } },
                select: { mediaUrls: true, sourceAccount: true }
            });

            // Flatten media
            allMedia = sourcePosts.flatMap(p => (Array.isArray(p.mediaUrls) ? p.mediaUrls : []));
        }

        return {
            ...art,
            mediaUrls: allMedia,
            sourceAccounts: art.sourceAccounts, // already on model
        };
    }));

    return NextResponse.json({ articles: hydratedArticles, total, limit, offset });
}
