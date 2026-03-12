import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/admin/youtube-cookies
 *
 * Saves YouTube cookies to Azure Container App secrets via REST API.
 * Fully automatic - no terminal commands needed!
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

        console.log("[YouTube Cookies] Received cookies, length:", cookies.length);
        console.log("[YouTube Cookies] Base64 encoded, length:", cookiesBase64.length);

        // Get Azure credentials from environment
        const AZURE_SUBSCRIPTION_ID = process.env.AZURE_SUBSCRIPTION_ID;
        const AZURE_CREDENTIALS = process.env.AZURE_CREDENTIALS;
        const IS_LOCALHOST = !AZURE_CREDENTIALS || process.env.NODE_ENV === 'development';

        // Localhost mode: simulate successful deployment for testing UI
        if (IS_LOCALHOST) {
            console.log("[YouTube Cookies] 🏠 Localhost mode - simulating deployment for testing...");

            // Simulate API processing delay
            await new Promise(resolve => setTimeout(resolve, 2000));

            console.log("[YouTube Cookies] ✅ [SIMULATED] Deployment successful");

            return NextResponse.json({
                success: true,
                deployed: true,
                message: "✅ [LOCALHOST MODE] Cookies validated successfully!\n\nIn production, these would be automatically deployed to Azure.\n\nWhat happens in production:\n1. ✅ Authenticate to Azure using service principal\n2. ✅ Update worker-youtube-sg secrets with cookies\n3. ✅ Set YOUTUBE_COOKIES_BASE64 environment variable\n4. ✅ Worker restarts automatically (~30 seconds)\n\nDeploy to Azure to test real deployment!",
                localhost: true
            });
        }

        try {
            // Parse Azure credentials
            const creds = JSON.parse(AZURE_CREDENTIALS);
            const { clientId, clientSecret, tenantId } = creds;

            console.log("[YouTube Cookies] Using Azure REST API to deploy...");

            // Step 1: Get access token
            const tokenResponse = await fetch(`https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`, {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: new URLSearchParams({
                    client_id: clientId,
                    client_secret: clientSecret,
                    scope: "https://management.azure.com/.default",
                    grant_type: "client_credentials"
                })
            });

            if (!tokenResponse.ok) {
                throw new Error(`Failed to get Azure token: ${await tokenResponse.text()}`);
            }

            const { access_token } = await tokenResponse.json();
            console.log("[YouTube Cookies] ✅ Got Azure access token");

            // Step 2: Get current worker configuration
            const workerApiUrl = `https://management.azure.com/subscriptions/${AZURE_SUBSCRIPTION_ID}/resourceGroups/john-threads/providers/Microsoft.App/containerApps/worker-youtube-sg?api-version=2023-05-01`;

            const getResponse = await fetch(workerApiUrl, {
                headers: { "Authorization": `Bearer ${access_token}` }
            });

            if (!getResponse.ok) {
                throw new Error(`Failed to get worker config: ${await getResponse.text()}`);
            }

            const workerConfig = await getResponse.json();
            console.log("[YouTube Cookies] ✅ Got worker configuration");

            // Step 3: Update secrets
            // IMPORTANT: Preserve existing secrets structure (some use keyVaultUrl, some use value)
            const secrets = workerConfig.properties.configuration.secrets || [];
            const existingSecretIndex = secrets.findIndex((s: any) => s.name === "youtube-cookies");

            if (existingSecretIndex >= 0) {
                // Update existing youtube-cookies secret, preserving any other fields
                secrets[existingSecretIndex] = {
                    ...secrets[existingSecretIndex],
                    name: "youtube-cookies",
                    value: cookiesBase64
                };
            } else {
                // Add new youtube-cookies secret
                secrets.push({ name: "youtube-cookies", value: cookiesBase64 });
            }

            console.log(`[YouTube Cookies] Secrets in configuration: ${secrets.map((s: any) => s.name).join(", ")}`)

            // Step 4: Update environment variables
            const envVars = workerConfig.properties.template.containers[0].env || [];
            const existingEnvIndex = envVars.findIndex((e: any) => e.name === "YOUTUBE_COOKIES_BASE64");

            if (existingEnvIndex >= 0) {
                envVars[existingEnvIndex].secretRef = "youtube-cookies";
                delete envVars[existingEnvIndex].value; // Remove value if it was set directly
            } else {
                envVars.push({ name: "YOUTUBE_COOKIES_BASE64", secretRef: "youtube-cookies" });
            }

            workerConfig.properties.configuration.secrets = secrets;
            workerConfig.properties.template.containers[0].env = envVars;

            // Step 5: Apply update
            console.log("[YouTube Cookies] Updating worker container app...");
            const updateResponse = await fetch(workerApiUrl, {
                method: "PUT",
                headers: {
                    "Authorization": `Bearer ${access_token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(workerConfig)
            });

            if (!updateResponse.ok) {
                const errorText = await updateResponse.text();
                throw new Error(`Failed to update worker: ${errorText}`);
            }

            console.log("[YouTube Cookies] ✅ Worker updated successfully!");

            return NextResponse.json({
                success: true,
                message: "✅ Cookies deployed to Azure automatically! YouTube videos should now work. The worker will restart in ~30 seconds.",
                deployed: true
            });

        } catch (azError: any) {
            console.error("[YouTube Cookies] Azure REST API error:", azError.message);

            // Fallback: provide manual instructions
            return NextResponse.json({
                success: true,
                deployed: false,
                message: "✅ Cookies validated! Auto-deploy failed. Copy and run these commands:",
                commands: [
                    `az containerapp secret set --name worker-youtube-sg --resource-group john-threads --secrets "youtube-cookies=${cookiesBase64}"`,
                    `az containerapp update --name worker-youtube-sg --resource-group john-threads --set-env-vars "YOUTUBE_COOKIES_BASE64=secretref:youtube-cookies"`
                ]
            });
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

    return NextResponse.json({
        configured: false,
        message: "Cookie status checking not implemented yet"
    });
}
