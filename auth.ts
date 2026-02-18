import NextAuth from "next-auth"
import Twitter from "next-auth/providers/twitter"
import Instagram from "next-auth/providers/instagram"
import { prisma } from "@/lib/prisma"
import { cookies } from "next/headers"

export const { handlers, auth, signIn, signOut } = NextAuth({
    providers: [
        Twitter({
            clientId: process.env.AUTH_TWITTER_ID,
            clientSecret: process.env.AUTH_TWITTER_SECRET,
            // Request offline access to get a refresh token
            authorization: { params: { scope: "users.read tweet.read tweet.write offline.access" } },
        }),
        Instagram({
            clientId: process.env.AUTH_INSTAGRAM_ID,
            clientSecret: process.env.AUTH_INSTAGRAM_SECRET,
            // Standard scopes for Basic Display. 
            // Note: Publishing usually requires "Instagram Graph API" via Facebook Login or specialized scopes.
            // NextAuth's default Instagram provider is often for Basic Display. 
            // We will start with this and adjust if we need the Facebook provider for business publishing.
            authorization: { params: { scope: "user_profile,user_media" } },
        }),
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
                            // We might want to store the Twitter username/ID too for display
                            // twitterApiKey/Secret are App credentials, not user tokens. 
                            // We are shifting to OAuth 2.0 user tokens (access_token).
                            // Ideally we'd have a separate field for `twitterUserId` or similar.
                        },
                    })
                    console.log(`Updated Twitter tokens for workspace ${workspaceId}`)
                } else if (account.provider === "instagram") {
                    await prisma.workspace.update({
                        where: { id: workspaceId },
                        data: {
                            instagramAccessToken: account.access_token,
                            instagramRefreshToken: account.refresh_token,
                            instagramExpiresAt: account.expires_at,
                            instagramAccountId: account.providerAccountId, // Store the IG user ID
                        },
                    })
                    console.log(`Updated Instagram tokens for workspace ${workspaceId}`)
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
