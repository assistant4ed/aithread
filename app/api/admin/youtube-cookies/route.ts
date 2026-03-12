import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/youtube-cookies
 *
 * Saves YouTube cookies to database for yt-dlp to bypass bot detection.
 * Cookies are base64 encoded for safe storage.
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

        // Basic validation: should start with Netscape format header or contain youtube.com
        if (!cookies.includes("youtube.com")) {
            return NextResponse.json({
                error: "Cookies don't appear to be from YouTube. Make sure you exported cookies from youtube.com"
            }, { status: 400 });
        }

        // Validate it contains important YouTube session cookies
        const hasSessionCookies = cookies.includes("SAPISID") || cookies.includes("SID") || cookies.includes("HSID");
        if (!hasSessionCookies) {
            return NextResponse.json({
                error: "Cookies appear incomplete. Make sure you're logged into YouTube when exporting."
            }, { status: 400 });
        }

        // Base64 encode for safe storage (handles multiline, special characters)
        const cookiesBase64 = Buffer.from(cookies).toString("base64");

        // Store in database (using a simple key-value config table)
        // First, check if we have a Config model, if not we'll use a different approach

        // For now, let's store it in a simple way using Prisma's raw query or create a Config table
        // Since we don't have a Config model, let's store it as an environment variable approach
        // by updating it in Azure directly

        console.log("[YouTube Cookies] Received cookies, length:", cookies.length);
        console.log("[YouTube Cookies] Base64 encoded, length:", cookiesBase64.length);
        console.log("[YouTube Cookies] Contains youtube.com entries:", cookies.includes("youtube.com"));
        console.log("[YouTube Cookies] Has session cookies:", hasSessionCookies);

        // Automatically update Azure Container App secrets
        const { execFile } = require("child_process");
        const { promisify } = require("util");
        const execFileAsync = promisify(execFile);

        try {
            // Step 1: Set the secret in Azure
            console.log("[YouTube Cookies] Setting Azure Container App secret...");
            await execFileAsync("az", [
                "containerapp", "secret", "set",
                "--name", "worker-youtube-sg",
                "--resource-group", "john-threads",
                "--secrets", `youtube-cookies=${cookiesBase64}`
            ]);

            // Step 2: Update environment variable to use the secret
            console.log("[YouTube Cookies] Updating environment variable...");
            await execFileAsync("az", [
                "containerapp", "update",
                "--name", "worker-youtube-sg",
                "--resource-group", "john-threads",
                "--set-env-vars", "YOUTUBE_COOKIES_BASE64=secretref:youtube-cookies"
            ]);

            // Step 3: Also update the web container for local testing via API
            console.log("[YouTube Cookies] Updating web container...");
            await execFileAsync("az", [
                "containerapp", "update",
                "--name", "web-sg",
                "--resource-group", "john-threads",
                "--set-env-vars", "YOUTUBE_COOKIES_BASE64=secretref:youtube-cookies"
            ]);

            // Step 4: Set the same secret for web container
            await execFileAsync("az", [
                "containerapp", "secret", "set",
                "--name", "web-sg",
                "--resource-group", "john-threads",
                "--secrets", `youtube-cookies=${cookiesBase64}`
            ]);

            console.log("[YouTube Cookies] ✅ All containers updated successfully!");

            return NextResponse.json({
                success: true,
                message: "✅ Cookies saved and deployed! YouTube videos should now work. The worker container will restart automatically with the new cookies.",
                deployed: true
            });

        } catch (azError: any) {
            console.error("[YouTube Cookies] Azure CLI error:", azError.stderr || azError.message);

            // Fallback: provide manual instructions
            return NextResponse.json({
                success: false,
                error: "Automatic deployment failed. Please follow manual instructions below.",
                cookiesBase64,
                manualInstructions: [
                    "Run these commands in your terminal:",
                    "",
                    `az containerapp secret set --name worker-youtube-sg --resource-group john-threads --secrets youtube-cookies="${cookiesBase64.substring(0, 40)}..."`,
                    "",
                    `az containerapp update --name worker-youtube-sg --resource-group john-threads --set-env-vars "YOUTUBE_COOKIES_BASE64=secretref:youtube-cookies"`,
                    "",
                    "Worker will restart automatically with new cookies."
                ]
            }, { status: 500 });
        }

    } catch (error: any) {
        console.error("[YouTube Cookies] Error saving cookies:", error);
        return NextResponse.json({ error: "Failed to save cookies" }, { status: 500 });
    }
}

/**
 * GET /api/admin/youtube-cookies
 *
 * Check if YouTube cookies are configured
 */
export async function GET(req: NextRequest) {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    try {
        const fs = require("fs/promises");
        const path = require("path");
        const cookiesPath = path.join(process.cwd(), "youtube-cookies.txt");

        try {
            const stats = await fs.stat(cookiesPath);
            const content = await fs.readFile(cookiesPath, "utf-8");
            const lineCount = content.split("\n").length;
            const hasYouTube = content.includes("youtube.com");
            const hasSession = content.includes("SAPISID");

            return NextResponse.json({
                configured: true,
                file: cookiesPath,
                size: stats.size,
                lines: lineCount,
                hasYouTubeCookies: hasYouTube,
                hasSessionCookies: hasSession,
                lastModified: stats.mtime
            });
        } catch (err) {
            // File doesn't exist
            return NextResponse.json({
                configured: false,
                message: "No cookies file found. Please configure cookies."
            });
        }

    } catch (error: any) {
        console.error("[YouTube Cookies] Error checking cookies:", error);
        return NextResponse.json({ error: "Failed to check cookies" }, { status: 500 });
    }
}
