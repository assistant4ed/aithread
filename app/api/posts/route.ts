import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET /api/posts — query posts with optional filters
// Query params: status, workspaceId, limit, offset, sortBy, sortOrder
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

    // Ownership scoping
    if (workspaceId) {
        // Verify user owns this workspace
        const ws = await (prisma as any).workspace.findUnique({
            where: { id: workspaceId },
            select: { ownerId: true }
        });
        if (!ws || (ws.ownerId && ws.ownerId !== userId)) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
        where.workspaceId = workspaceId;
    } else {
        // Only return posts from workspaces the user owns (or are public)
        where.workspace = {
            OR: [
                { ownerId: userId },
                { ownerId: null }
            ]
        };
    }

    // Sorting: default by createdAt desc, allow hotScore sorting
    const sortBy = searchParams.get("sortBy") || "createdAt";
    const sortOrder = searchParams.get("sortOrder") || "desc";
    const allowedSortFields = ["createdAt", "hotScore", "likes", "postedAt"];
    const orderByField = allowedSortFields.includes(sortBy) ? sortBy : "createdAt";
    const orderByDir = sortOrder === "asc" ? "asc" : "desc";

    const [posts, total] = await Promise.all([
        (prisma as any).post.findMany({
            where,
            orderBy: { [orderByField]: orderByDir },
            take: Math.min(limit, 100),
            skip: offset,
            include: {
                workspace: { select: { id: true, name: true } },
            },
        }),
        (prisma as any).post.count({ where }),
    ]);

    return NextResponse.json({ posts, total, limit, offset });
}
