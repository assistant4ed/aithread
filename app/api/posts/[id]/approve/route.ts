import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/posts/:id/approve — convenience route for OpenClaw bot
export async function POST(_request: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;

    try {
        // Verify ownership
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

        const updated = await (prisma as any).post.update({
            where: { id },
            data: { status: "APPROVED" },
        });

        return NextResponse.json({ message: "Post approved", post: updated });
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }
        console.error("Error approving post:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
