import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/posts — query posts with optional filters
// Query params: status, workspaceId, limit, offset
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);

    const status = searchParams.get("status");
    const workspaceId = searchParams.get("workspaceId");
    const limit = parseInt(searchParams.get("limit") || "50", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);

    const where: Record<string, any> = {};
    if (status) where.status = status;
    if (workspaceId) where.workspaceId = workspaceId;

    const [posts, total] = await Promise.all([
        prisma.post.findMany({
            where,
            orderBy: { createdAt: "desc" },
            take: Math.min(limit, 100),
            skip: offset,
            include: {
                workspace: { select: { id: true, name: true } },
            },
        }),
        prisma.post.count({ where }),
    ]);

    return NextResponse.json({ posts, total, limit, offset });
}
