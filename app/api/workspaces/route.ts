import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

// GET /api/workspaces — list all workspaces
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaces = await prisma.workspace.findMany({
        where: {
            OR: [
                { ownerId: session.user.id },
                { ownerId: null }
            ]
        },
        orderBy: { createdAt: "desc" },
        include: {
            _count: { select: { posts: true } },
            sources: true,
        },
    });

    return NextResponse.json(workspaces);
}

// POST /api/workspaces — create a new workspace
export async function POST(request: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const body = await request.json();
        const {
            name,
            targetAccounts,
            translationPrompt,
            clusteringPrompt,
            hotScoreThreshold,
            threadsAppId,
            threadsToken,
            dailyPostLimit,
            topicFilter,
            maxPostAgeHours,
            postLookbackHours,
            publishTimes,
            reviewWindowHours,
            synthesisLanguage,
            instagramAccessToken,
            instagramAccountId,
            twitterApiKey,
            twitterApiSecret,
            twitterAccessToken,
            twitterAccessSecret,
            sources,
            aiProvider,
            aiModel,
            aiApiKey,
            synthesisPrompt,
            coherenceThreshold,
        } = body;

        if (!name) {
            return NextResponse.json(
                { error: "Workspace name is required" },
                { status: 400 }
            );
        }

        const workspace = await prisma.workspace.create({
            data: {
                name,
                targetAccounts: targetAccounts || [],
                translationPrompt: translationPrompt || "",
                clusteringPrompt: clusteringPrompt || undefined,
                synthesisLanguage: synthesisLanguage || "Traditional Chinese (HK/TW)",
                hotScoreThreshold: hotScoreThreshold ?? 50,
                threadsAppId: threadsAppId || null,
                threadsToken: threadsToken || null,
                instagramAccessToken: instagramAccessToken || null,
                instagramAccountId: instagramAccountId || null,
                twitterApiKey: twitterApiKey || null,
                twitterApiSecret: twitterApiSecret || null,
                twitterAccessToken: twitterAccessToken || null,
                twitterAccessSecret: twitterAccessSecret || null,
                dailyPostLimit: dailyPostLimit || 3,
                topicFilter: topicFilter || null,
                maxPostAgeHours: maxPostAgeHours ?? 48,
                postLookbackHours: postLookbackHours ?? 24,
                publishTimes: publishTimes || ["12:00", "18:00", "22:00"],
                reviewWindowHours: reviewWindowHours ?? 1,
                sources: sources ? {
                    create: sources.map((s: any) => ({
                        type: s.type,
                        value: s.value,
                        platform: s.platform || 'THREADS',
                        isActive: s.isActive ?? true,
                        minLikes: s.minLikes,
                        minReplies: s.minReplies,
                        maxAgeHours: s.maxAgeHours,
                        trustWeight: s.trustWeight || 1.0,
                    }))
                } : undefined,
                aiProvider: aiProvider || "GROQ",
                aiModel: aiModel || "llama-3.3-70b-versatile",
                aiApiKey: aiApiKey || null,
                synthesisPrompt: synthesisPrompt || undefined,
                coherenceThreshold: coherenceThreshold ? Number(coherenceThreshold) : undefined,
                ownerId: session.user.id,
            },
            include: { sources: true }
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
