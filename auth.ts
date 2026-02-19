import NextAuth from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Twitter from "next-auth/providers/twitter"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"

// Debugging Credential Loading
const missing = []
if (!process.env.AUTH_TWITTER_ID) missing.push("AUTH_TWITTER_ID")
if (!process.env.AUTH_TWITTER_SECRET) missing.push("AUTH_TWITTER_SECRET")
if (!process.env.AUTH_INSTAGRAM_ID) missing.push("AUTH_INSTAGRAM_ID")
if (!process.env.AUTH_INSTAGRAM_SECRET) missing.push("AUTH_INSTAGRAM_SECRET")
if (!process.env.AUTH_THREADS_ID) missing.push("AUTH_THREADS_ID")
if (!process.env.AUTH_THREADS_SECRET) missing.push("AUTH_THREADS_SECRET")

if (missing.length > 0) {
    console.error("❌ [NextAuth] Missing Environment Variables:", missing.join(", "))
} else {
    console.log("✅ [NextAuth] Environment Variables Check:")
    console.log(`   - AUTH_TWITTER_ID length: ${process.env.AUTH_TWITTER_ID?.length || 0}`)
    console.log(`   - AUTH_TWITTER_SECRET length: ${process.env.AUTH_TWITTER_SECRET?.length || 0}`)
    console.log(`   - AUTH_INSTAGRAM_ID length: ${process.env.AUTH_INSTAGRAM_ID?.length || 0}`)
    console.log(`   - AUTH_INSTAGRAM_SECRET length: ${process.env.AUTH_INSTAGRAM_SECRET?.length || 0}`)
    console.log(`   - AUTH_THREADS_ID length: ${process.env.AUTH_THREADS_ID?.length || 0}`)
    console.log(`   - AUTH_THREADS_SECRET length: ${process.env.AUTH_THREADS_SECRET?.length || 0}`)
    console.log(`   - AUTH_SECRET length: ${process.env.AUTH_SECRET?.length || 0}`)
    console.log(`   - AUTH_URL: ${process.env.AUTH_URL}`)
}

export const { handlers, auth, signIn, signOut } = NextAuth({
    debug: true,
    trustHost: true,
    secret: process.env.AUTH_SECRET,
    providers: [
        Twitter({
            clientId: process.env.AUTH_TWITTER_ID,
            clientSecret: process.env.AUTH_TWITTER_SECRET,
            authorization: {
                url: "https://twitter.com/i/oauth2/authorize",
                params: {
                    scope: "users.read tweet.read tweet.write offline.access",
                },
            },
            token: "https://api.twitter.com/2/oauth2/token",
        }),
        Facebook({
            clientId: process.env.AUTH_INSTAGRAM_ID,
            clientSecret: process.env.AUTH_INSTAGRAM_SECRET,
            // We use Facebook provider to access Instagram Graph API (Business Publishing)
            authorization: {
                params: {
                    scope: "email,public_profile,instagram_basic,instagram_content_publish,pages_show_list,business_management"
                }
            },
        }),
        {
            id: "threads",
            name: "Threads",
            type: "oauth",
            clientId: process.env.AUTH_THREADS_ID,
            clientSecret: process.env.AUTH_THREADS_SECRET,
            checks: ["state"],
            // Ensure creds are in the body for our proxy to see them easily
            client: {
                token_endpoint_auth_method: "client_secret_post",
            },
            authorization: {
                url: "https://www.threads.com/oauth/authorize",
                params: {
                    scope: "threads_basic,threads_content_publish",
                    response_type: "code",
                },
            },
            token: {
                // Point to our local proxy which will fix the response
                url: "http://127.0.0.1:3000/api/proxy/threads-token",
            },
            userinfo: {
                url: "https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url",
                async request({ tokens }: { tokens: any }) {
                    console.log("👤 [Threads] Fetching user profile...");
                    const response = await fetch("https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=" + tokens.access_token);
                    const profileData = await response.json();
                    console.log("✅ [Threads] Profile response:", JSON.stringify(profileData));
                    return profileData;
                }
            },
            profile(profile: any) {
                console.log("📝 [Threads] Mapping profile for:", profile.username);
                return {
                    id: String(profile.id),
                    name: profile.username,
                    image: profile.threads_profile_picture_url,
                    email: null,
                }
            },
        },
    ],
    callbacks: {
        async signIn({ user, account, profile }) {
            if (!account) return false

            // 1. Identify which workspace initiated this connection
            const cookieStore = await cookies()
            const workspaceId = cookieStore.get("connect_workspace_id")?.value

            if (!workspaceId) {
                console.error("No workspace ID found in cookies during OAuth callback")
                return false // Reject sign-in if we don't know where to attach the tokens
            }

            try {
                // 2. Update the Workspace with the new tokens
                if (account.provider === "twitter") {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            twitterAccessToken: account.access_token,
                            twitterRefreshToken: account.refresh_token,
                            twitterExpiresAt: account.expires_at,
                            // Clear legacy OAuth 1.0a secret to prevent "Bad Authentication Data" errors
                            // and force the publisher to use OAuth 2.0 (Text-only mode)
                            twitterAccessSecret: null,
                            // We might want to store the Twitter username/ID too for display
                            // twitterApiKey/Secret are App credentials, not user tokens. 
                            // We are shifting to OAuth 2.0 user tokens (access_token).
                            // Ideally we'd have a separate field for `twitterUserId` or similar.
                        },
                    })
                    console.log(`Updated Twitter tokens for workspace ${workspaceId}`)
                } else if (account.provider === "facebook") {
                    // Fetch the actual Instagram Business Account ID
                    // 1. Get user's pages
                    const pagesReq = await fetch(`https://graph.facebook.com/v19.0/me/accounts?fields=instagram_business_account&access_token=${account.access_token}`);
                    const pagesData = await pagesReq.json();

                    let instagramAccountId: string | null = null;

                    if (pagesData.data && pagesData.data.length > 0) {
                        console.log(`📄 Found ${pagesData.data.length} Facebook Pages`);
                        console.log("📝 Full Pages Data:", JSON.stringify(pagesData.data));
                        // Find the first page with a connected IG business account
                        const pageWithIg = pagesData.data.find((p: any) => p.instagram_business_account);
                        if (pageWithIg) {
                            instagramAccountId = pageWithIg.instagram_business_account.id;
                            console.log(`✅ Found Linked Instagram Business ID: ${instagramAccountId}`);
                        } else {
                            console.warn("⚠️ No Instagram Business Account found linked to your Facebook Pages. Ensure your IG account is set to 'Business' or 'Creator' and linked to a Page.");
                        }
                    } else {
                        console.warn("⚠️ No Facebook Pages found for this user account.");
                    }

                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            instagramAccessToken: account.access_token,
                            instagramRefreshToken: account.refresh_token,
                            instagramExpiresAt: account.expires_at,
                            instagramAccountId: instagramAccountId,
                        },
                    })
                    console.log(`Updated Instagram (via Facebook) tokens for workspace ${workspaceId}`)
                } else if (account.provider === "threads") {
                    console.log("🛑 [Threads] SignIn Callback Debug:");
                    console.log("   - account.providerAccountId:", account.providerAccountId);
                    console.log("   - account.userId:", account.userId);
                    console.log("   - profile.id:", profile?.id);

                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            threadsToken: account.access_token, // Map access_token to our existing threadsToken field
                            threadsRefreshToken: account.refresh_token,
                            threadsExpiresAt: account.expires_at,
                            threadsAppId: account.providerAccountId, // Store the Threads user ID in existing threadsAppId field (or creates a new one if pref)
                        },
                    })
                    console.log(`Updated Threads tokens for workspace ${workspaceId}`)
                }

                // 3. Prevent actual "login" to the app. We just wanted the tokens.
                // Return false to deny the session creation, OR redirect back to the workspace edit page.
                // Returning a URL strings redirects there.
                return `/workspaces/${workspaceId}/edit?connected=${account.provider}`

            } catch (error) {
                console.error("Error updating workspace with OAuth tokens:", error)
                return false
            }
        },
    },
})

export const { GET, POST } = handlers
