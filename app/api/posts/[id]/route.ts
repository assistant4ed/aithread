import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/posts/:id — single post detail
export async function GET(_request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    const post = await prisma.post.findUnique({
        where: { id },
        include: {
            workspace: { select: { id: true, name: true } },
        },
    });

    if (!post) {
        return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json(post);
}

// PATCH /api/posts/:id — update post status, translation, etc.
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    try {
        const body = await request.json();

        const allowedFields = [
            "status", "contentTranslated", "coherenceStatus", "topicClusterId",
        ];

        const data: Record<string, any> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                data[field] = body[field];
            }
        }

        // Auto-set publishedAt when status changes to PUBLISHED
        if (data.status === "PUBLISHED") {
            data.publishedAt = new Date();
        }

        const post = await prisma.post.update({
            where: { id },
            data,
        });

        return NextResponse.json(post);
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }
        console.error("Error updating post:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
