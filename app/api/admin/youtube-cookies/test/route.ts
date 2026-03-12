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

        // Write cookies to a temp file
        const fs = require("fs/promises");
        const path = require("path");
        const { execFile } = require("child_process");
        const { promisify } = require("util");
        const execFileAsync = promisify(execFile);

        const tempCookiesPath = path.join("/tmp", `test-cookies-${Date.now()}.txt`);
        await fs.writeFile(tempCookiesPath, cookies, "utf-8");

        try {
            // Test with a known working video (Python tutorial that was failing before)
            const testVideoUrl = "https://www.youtube.com/watch?v=_uQrJ0TkZlc";

            console.log("[Cookies Test] Testing with video:", testVideoUrl);

            const { stdout } = await execFileAsync("yt-dlp", [
                "--dump-json",
                "--no-playlist",
                "--socket-timeout", "30",
                "--extractor-args", "youtube:player_client=ios,android,web",
                "--user-agent", "Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1",
                "--cookies", tempCookiesPath,
                testVideoUrl
            ], { timeout: 45000 });

            const metadata = JSON.parse(stdout);

            // Cleanup temp file
            await fs.unlink(tempCookiesPath).catch(() => {});

            return NextResponse.json({
                success: true,
                message: `✅ Cookies work! Successfully extracted: "${metadata.title}"`,
                testVideo: {
                    title: metadata.title,
                    channel: metadata.channel,
                    duration: Math.floor(metadata.duration / 60) + " minutes",
                    views: metadata.view_count?.toLocaleString() || "N/A"
                }
            });

        } catch (ytdlpError: any) {
            // Cleanup temp file
            await fs.unlink(tempCookiesPath).catch(() => {});

            console.error("[Cookies Test] yt-dlp error:", ytdlpError.stderr);

            if (ytdlpError.stderr?.includes("Sign in to confirm")) {
                return NextResponse.json({
                    success: false,
                    error: "❌ Cookies don't work - still getting bot detection error. Make sure you're logged into YouTube when exporting cookies."
                }, { status: 400 });
            } else if (ytdlpError.stderr?.includes("Private video") || ytdlpError.stderr?.includes("unavailable")) {
                return NextResponse.json({
                    success: false,
                    error: "Test video is unavailable. Trying alternative test..."
                }, { status: 400 });
            } else {
                return NextResponse.json({
                    success: false,
                    error: `yt-dlp error: ${ytdlpError.stderr || ytdlpError.message}`
                }, { status: 500 });
            }
        }

    } catch (error: any) {
        console.error("[Cookies Test] Error:", error);
        return NextResponse.json({ error: "Failed to test cookies" }, { status: 500 });
    }
}
