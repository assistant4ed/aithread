
import { NextRequest, NextResponse } from "next/server";
import { Storage } from "@google-cloud/storage";
import { prisma } from "@/lib/prisma";

const storage = new Storage();
const bucketName = process.env.GCS_BUCKET_NAME || "threads-monitor-uploads";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    try {
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

        // Make public if needed, or just use the authenticated URL if the bucket is public?
        // Assuming the bucket is public-read or we use a signed URL. 
        // For now, let's assume public-read or return the public URL format.
        const publicUrl = `https://storage.googleapis.com/${bucketName}/${filename}`;

        console.log(`[Upload] Uploaded ${filename} to ${publicUrl}`);

        return NextResponse.json({ url: publicUrl, type: file.type.startsWith("video") ? "video" : "image" });

    } catch (error: any) {
        console.error("Upload error:", error);
        return NextResponse.json({ error: error.message || "Upload failed" }, { status: 500 });
    }
}
