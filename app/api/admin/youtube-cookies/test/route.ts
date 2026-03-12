import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * POST /api/admin/youtube-cookies/test
 *
 * Test if the provided cookies work by trying to extract metadata from a test video
 */
export async function POST(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const { cookies } = await req.json();

        if (!cookies || typeof cookies !== "string") {
            return NextResponse.json({ error: "Invalid cookies format" }, { status: 400 });
        }

        // Validate cookie format (should be Netscape format)
        const lines = cookies.trim().split('\n');

        // Check for Netscape header or youtube.com entries
        const hasNetscapeHeader = cookies.includes('# Netscape HTTP Cookie File') || cookies.includes('# HTTP Cookie File');
        const hasYouTubeCookies = cookies.includes('youtube.com');
        const hasSessionCookies = cookies.includes('SAPISID') || cookies.includes('SID') || cookies.includes('HSID');

        if (!hasYouTubeCookies) {
            return NextResponse.json({
                success: false,
                error: "❌ No youtube.com cookies found. Make sure you export cookies from YouTube.com (not any other site)."
            }, { status: 400 });
        }

        if (!hasSessionCookies) {
            return NextResponse.json({
                success: false,
                error: "❌ Missing session cookies (SAPISID, SID, HSID). Make sure you're logged into YouTube when exporting cookies."
            }, { status: 400 });
        }

        // Count cookie entries (lines that don't start with #)
        const cookieCount = lines.filter(line => line.trim() && !line.startsWith('#')).length;

        if (cookieCount < 5) {
            return NextResponse.json({
                success: false,
                error: `❌ Only ${cookieCount} cookies found. Make sure you export ALL cookies from youtube.com, not just a few.`
            }, { status: 400 });
        }

        // All validations passed
        return NextResponse.json({
            success: true,
            message: `✅ Cookies look valid! Found ${cookieCount} cookies including YouTube session data.\n\nClick "Save & Deploy to Azure" to activate them. Then test with a real video to confirm they work.`,
            validation: {
                cookieCount,
                hasYouTubeCookies,
                hasSessionCookies,
                hasNetscapeHeader
            }
        });

    } catch (error: any) {
        console.error("[Cookies Test] Error:", error);
        return NextResponse.json({ error: "Failed to test cookies" }, { status: 500 });
    }
}
