import NextAuth from "next-auth"
import Facebook from "next-auth/providers/facebook"
import Twitter from "next-auth/providers/twitter"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"
import { exchangeForLongLivedToken } from "@/lib/threads_client"
import { PrismaAdapter } from "@auth/prisma-adapter"
import Credentials from "next-auth/providers/credentials"
import bcrypt from "bcryptjs"


export const { handlers, auth, signIn, signOut } = NextAuth({
    adapter: PrismaAdapter(prisma),
    debug: false,
    trustHost: true,
    secret: process.env.AUTH_SECRET,
    session: { strategy: "jwt" }, // We use JWT for middleware compatibility
    providers: [
        Credentials({
            name: "Credentials",
            credentials: {
                email: { label: "Email", type: "email" },
                password: { label: "Password", type: "password" }
            },
            async authorize(credentials) {
                console.log("[Auth] Authorize called with:", credentials?.email);
                if (!credentials?.email || !credentials?.password) {
                    console.log("[Auth] Missing credentials");
                    return null;
                }

                try {
                    const user = await (prisma as any).user.findUnique({
                        where: { email: credentials.email as string }
                    });

                    if (!user) {
                        console.log("[Auth] User not found:", credentials.email);
                        return null;
                    }

                    if (!user.passwordHash) {
                        console.log("[Auth] User has no password hash:", credentials.email);
                        return null;
                    }

                    const isValid = await bcrypt.compare(
                        credentials.password as string,
                        user.passwordHash
                    );

                    if (!isValid) {
                        console.log("[Auth] Password mismatch for:", credentials.email);
                        return null;
                    }

                    console.log("[Auth] Login successful for:", credentials.email);
                    return {
                        id: user.id,
                        email: user.email,
                        name: user.name,
                    };
                } catch (err: any) {
                    console.error("[Auth] Authorize internal error:", err.message);
                    return null;
                }
            }
        }),
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
                url: "https://www.threads.net/oauth/authorize",
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
                    const response = await fetch("https://graph.threads.net/v1.0/me?fields=id,username,threads_profile_picture_url&access_token=" + tokens.access_token);
                    return await response.json();
                }
            },
            profile(profile: any) {
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
        async signIn({ user, account, profile }: { user: any, account?: any, profile?: any }) {
            console.log("[Auth] signIn callback for provider:", account?.provider);
            if (!account) {
                console.log("[Auth] No account object in signIn callback");
                return false;
            }

            // 1. Identify which workspace initiated this connection
            const cookieStore = await cookies()
            const workspaceId = cookieStore.get("connect_workspace_id")?.value

            // If no workspace ID found, this is a main app login
            if (!workspaceId) {
                console.log("[Auth] Simple login (no workspace connect context), allowing.");
                return true
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
                    let accessToken = account.access_token;
                    let expiresAt = account.expires_at;

                    // Immediately exchange for long-lived token (60 days)
                    if (accessToken && process.env.AUTH_THREADS_SECRET) {
                        try {
                            console.log("🔄 [Auth] Exchanging Threads short-lived token for long-lived token...");
                            const longLived = await exchangeForLongLivedToken(accessToken, process.env.AUTH_THREADS_SECRET);
                            accessToken = longLived.access_token;
                            // expires_in is in seconds, expires_at in NextAuth is usually seconds from epoch
                            expiresAt = Math.floor(Date.now() / 1000) + longLived.expires_in;
                            console.log(`✅ [Auth] Obtained long-lived token. Expires in ${Math.floor(longLived.expires_in / 86400)} days.`);
                        } catch (err: any) {
                            console.error("❌ [Auth] Failed to exchange for long-lived token:", err.message);
                            // Fallback to short-lived token if exchange fails, though it will expire soon
                        }
                    }

                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            threadsToken: accessToken,
                            threadsRefreshToken: account.refresh_token,
                            threadsExpiresAt: expiresAt,
                            threadsAppId: account.providerAccountId,
                        },
                    })
                    console.log(`Updated Threads tokens for workspace ${workspaceId}`)
                }


                return `/workspaces/${workspaceId}/edit?connected=${account.provider}`

            } catch (error) {
                console.error("Error updating workspace with OAuth tokens:", error)
                return false
            }
        },
        async session({ session, token }: { session: any, token: any }) {
            if (token?.sub && session.user) {
                session.user.id = token.sub;
            }
            return session;
        },
        async jwt({ token, user }: { token: any, user: any }) {
            if (user) {
                token.id = user.id;
            }
            return token;
        }
    },
})

export const { GET, POST } = handlers
