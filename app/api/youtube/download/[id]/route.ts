import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getSignedUrl } from "@/lib/youtube/services/storage";

export async function GET(
    req: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { id } = await params;
        const searchParams = req.nextUrl.searchParams;
        const lang = searchParams.get("lang") || "zh-HK";

        // id is the videoId
        const fileName = `${id}_${lang}.pdf`;
        const gcsPath = `youtube/pdfs/${fileName}`;

        try {
            const signedUrl = await getSignedUrl(gcsPath);
            return NextResponse.redirect(signedUrl);
        } catch (storageErr) {
            console.error("[YouTube Download API] GCS Error:", storageErr);
            return NextResponse.json({ error: "File not found or storage error" }, { status: 404 });
        }

    } catch (error: any) {
        console.error("[YouTube Download API] Error:", error);
        return NextResponse.json({ error: "Internal server error" }, { status: 500 });
    }
}
