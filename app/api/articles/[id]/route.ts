import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface Params {
    params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: Params) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;

    const article = await (prisma as any).synthesizedArticle.findUnique({
        where: { id },
        include: {
            workspace: { select: { ownerId: true } }
        }
    });

    if (!article) {
        return NextResponse.json({ error: "Article not found" }, { status: 404 });
    }

    // Ownership check
    if (article.workspace?.ownerId && article.workspace.ownerId !== userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(article);
}

export async function PATCH(request: NextRequest, { params }: Params) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;
    const body = await request.json();

    try {
        // Verify ownership
        const article = await (prisma as any).synthesizedArticle.findUnique({
            where: { id },
            select: { workspace: { select: { ownerId: true } } }
        });

        if (!article) {
            return NextResponse.json({ error: "Article not found" }, { status: 404 });
        }

        if (article.workspace?.ownerId && article.workspace.ownerId !== userId) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const updated = await (prisma as any).synthesizedArticle.update({
            where: { id },
            data: body,
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Error updating article:", error);
        return NextResponse.json({ error: "Failed to update article" }, { status: 500 });
    }
}
