import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || "threads-monitor-uploads";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;

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

        const formData = await req.formData();
        const file = formData.get("file") as File;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `${id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
        const bucket = storage.bucket(bucketName);
        const blob = bucket.file(filename);

        await blob.save(buffer, {
            contentType: file.type,
            resumable: false,
        });

        // Make the file public
        await blob.makePublic();

        const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;

        console.log(`[Upload] Uploaded ${filename} to ${publicUrl}`);

        return NextResponse.json({ url: publicUrl, type: file.type.startsWith("video") ? "video" : "image" });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
    }
}
