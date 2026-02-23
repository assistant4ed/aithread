import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/posts/:id — single post detail
export async function GET(_request: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;

    const post = await (prisma as any).post.findUnique({
        where: { id },
        include: {
            workspace: { select: { id: true, name: true, ownerId: true } },
        },
    });

    if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.workspace?.ownerId && post.workspace.ownerId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(post);
}

// PATCH /api/posts/:id — update post status, translation, etc.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;

    try {
        const post = await (prisma as any).post.findUnique({
            where: { id },
            select: { workspace: { select: { ownerId: true } } }
        });

        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        if (post.workspace?.ownerId && post.workspace.ownerId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();

        const allowedFields = [
            "status", "contentTranslated", "contentOriginal", "mediaUrls", "coherenceStatus", "topicClusterId",
        ];

        const data: Record<string, any> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                data[field] = body[field];
            }
        }

        if (data.status === "PUBLISHED") {
            data.publishedAt = new Date();
        }

        const updated = await (prisma as any).post.update({
            where: { id },
            data,
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }
        console.error("Error updating post:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;

    try {
        const post = await (prisma as any).post.findUnique({
            where: { id },
            select: { workspace: { select: { ownerId: true } } }
        });

        if (!post) {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }

        if (post.workspace?.ownerId && post.workspace.ownerId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        await (prisma as any).post.delete({
            where: { id },
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        console.error("Error deleting post:", error);
        return NextResponse.json({ error: "Failed to delete post" }, { status: 500 });
    }
}
