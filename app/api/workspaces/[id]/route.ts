import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/workspaces/:id — single workspace detail
export async function GET(_request: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const workspace = await prisma.workspace.findUnique({
        where: { id },
        include: {
            _count: { select: { posts: true } },
            sources: true,
        },
    });

    if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    if (workspace.ownerId && workspace.ownerId !== session.user.id) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(workspace);
}

// PATCH /api/workspaces/:id — update workspace settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const existing = await prisma.workspace.findUnique({
            where: { id },
            select: { ownerId: true }
        });

        if (!existing) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        if (existing.ownerId && existing.ownerId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = await request.json();

        const allowedFields = [
            "name", "isActive", "targetAccounts", "translationPrompt",
            "hotScoreThreshold", "threadsAppId", "threadsToken", "dailyPostLimit",
            "topicFilter", "maxPostAgeHours", "synthesisLanguage",
            "publishTimes", "reviewWindowHours", "clusteringPrompt",
            "postLookbackHours",
            "instagramAccessToken", "instagramAccountId",
            "twitterApiKey", "twitterApiSecret", "twitterAccessToken", "twitterAccessSecret",
            "autoApproveDrafts", "autoApprovePrompt",
            "aiProvider", "aiModel", "aiApiKey",
            "synthesisPrompt", "coherenceThreshold",
        ];

        const data: Record<string, any> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                data[field] = body[field];
            }
        }

        if (body.sources && Array.isArray(body.sources)) {
            await prisma.scraperSource.deleteMany({
                where: { workspaceId: id }
            });

            data.sources = {
                create: body.sources.map((s: any) => ({
                    type: s.type,
                    value: s.value,
                    platform: s.platform || 'THREADS',
                    isActive: s.isActive ?? true,
                    minLikes: s.minLikes,
                    minReplies: s.minReplies,
                    maxAgeHours: s.maxAgeHours,
                    trustWeight: s.trustWeight || 1.0,
                }))
            };
        }

        if (!existing.ownerId) {
            data.ownerId = session.user.id;
        }

        const workspace = await prisma.workspace.update({
            where: { id },
            data,
            include: { sources: true }
        });

        return NextResponse.json(workspace);
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }
        if (error.code === "P2002") {
            return NextResponse.json({ error: "A workspace with this name already exists" }, { status: 409 });
        }
        console.error("Error updating workspace:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}

// DELETE /api/workspaces/:id — soft-delete (set isActive = false)
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    try {
        const existing = await prisma.workspace.findUnique({
            where: { id },
            select: { ownerId: true }
        });

        if (!existing) {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }

        if (existing.ownerId && existing.ownerId !== session.user.id) {
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const workspace = await prisma.workspace.update({
            where: { id },
            data: { isActive: false },
        });

        return NextResponse.json({ message: "Workspace deactivated", workspace });
    } catch (error: any) {
        if (error.code === "P2025") {
            return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
        }
        console.error("Error deleting workspace:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
