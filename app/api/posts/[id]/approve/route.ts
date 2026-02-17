import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// POST /api/posts/:id/approve — convenience route for OpenClaw bot
export async function POST(_request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    try {
        const post = await prisma.post.update({
            where: { id },
            data: { status: "APPROVED" },
        });

        return NextResponse.json({ message: "Post approved", post });
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Post not found" }, { status: 404 });
        }
        console.error("Error approving post:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
