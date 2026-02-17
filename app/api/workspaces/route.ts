import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET /api/workspaces — list all workspaces
export async function GET() {
    const workspaces = await prisma.workspace.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            _count: { select: { posts: true } },
        },
    });

    return NextResponse.json(workspaces);
}

// POST /api/workspaces — create a new workspace
export async function POST(request: NextRequest) {
    try {
        const {
            name,
            targetAccounts,
            translationPrompt,
            hotScoreThreshold,
            threadsAppId,
            threadsToken,
            dailyPostLimit,
            topicFilter,
            maxPostAgeHours,
        } = await request.json();

        if (!name || !translationPrompt) {
            return NextResponse.json(
                { error: "name and translationPrompt are required" },
                { status: 400 }
            );
        }

        const workspace = await prisma.workspace.create({
            data: {
                name,
                targetAccounts: targetAccounts || [],
                translationPrompt,
                hotScoreThreshold: hotScoreThreshold ?? 50,
                threadsAppId: threadsAppId || null,
                threadsToken: threadsToken || null,
                dailyPostLimit: dailyPostLimit || 3,
                topicFilter: topicFilter || null,
                maxPostAgeHours: maxPostAgeHours ?? 48,
            },
        });

        return NextResponse.json(workspace, { status: 201 });
    } catch (error: any) {
        if (error.code === "P2002") {
            return NextResponse.json(
                { error: "A workspace with this name already exists" },
                { status: 409 }
            );
        }
        console.error("Error creating workspace:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
