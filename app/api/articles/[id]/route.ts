
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

interface Params {
    params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: Params) {
    const { id } = await params;
    const body = await request.json();

    try {
        const updated = await prisma.synthesizedArticle.update({
            where: { id },
            data: body,
        });

        return NextResponse.json(updated);
    } catch (error: any) {
        console.error("Error updating article:", error);
        return NextResponse.json({ error: "Failed to update article" }, { status: 500 });
    }
}
