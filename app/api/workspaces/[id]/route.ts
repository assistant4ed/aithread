import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface RouteParams {
    params: Promise<{ id: string }>;
}

// GET /api/workspaces/:id — single workspace detail
export async function GET(_request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    const workspace = await prisma.workspace.findUnique({
        where: { id },
        include: {
            _count: { select: { posts: true } },
        },
    });

    if (!workspace) {
        return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
    }

    return NextResponse.json(workspace);
}

// PATCH /api/workspaces/:id — update workspace settings
export async function PATCH(request: NextRequest, { params }: RouteParams) {
    const { id } = await params;

    try {
        const body = await request.json();

        // Only allow updating specific fields
        const allowedFields = [
            "name", "isActive", "targetAccounts", "translationPrompt",
            "hotScoreThreshold", "threadsAppId", "threadsToken", "dailyPostLimit",
            "topicFilter", "maxPostAgeHours", "synthesisLanguage",
            "publishTimes", "reviewWindowHours",
        ];

        const data: Record<string, any> = {};
        for (const field of allowedFields) {
            if (body[field] !== undefined) {
                data[field] = body[field];
            }
        }

        const workspace = await prisma.workspace.update({
            where: { id },
            data,
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
    const { id } = await params;

    try {
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
