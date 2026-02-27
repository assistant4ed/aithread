import { NextRequest, NextResponse } from "next/server";
import { BlobServiceClient } from "@azure/storage-blob";
import { prisma } from "@/lib/prisma";
import { auth } from "@/auth";

const AZURE_STORAGE_CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
const CONTAINER_NAME = "media";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = session.user.id;

    const { id } = await params;

    if (!AZURE_STORAGE_CONNECTION_STRING) {
        return NextResponse.json({ error: "Storage configuration missing" }, { status: 500 });
    }

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

        const blobServiceClient = BlobServiceClient.fromConnectionString(AZURE_STORAGE_CONNECTION_STRING);
        const containerClient = blobServiceClient.getContainerClient(CONTAINER_NAME);
        const blockBlobClient = containerClient.getBlockBlobClient(filename);

        await blockBlobClient.uploadData(buffer, {
            blobHTTPHeaders: { blobContentType: file.type }
        });

        const publicUrl = blockBlobClient.url;

        console.log(`[Upload] Uploaded ${filename} to ${publicUrl}`);

        return NextResponse.json({ url: publicUrl, type: file.type.startsWith("video") ? "video" : "image" });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
    }
}
