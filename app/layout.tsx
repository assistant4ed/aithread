import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { auth, signOut } from "@/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Threads Monitor — Command Center",
  description: "Multi-workspace content monitoring and publishing platform for Threads.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const session = await auth();

  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <nav className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-foreground font-semibold text-lg tracking-tight">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
              Threads Monitor
            </a>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-4 text-sm text-muted">
                <a href="/" className="hover:text-foreground transition-colors">Workspaces</a>
                <span className="text-border">|</span>
                <span className="font-mono text-xs">v0.2.0</span>
              </div>
              {session?.user && (
                <div className="flex items-center gap-4 pl-4 border-l border-border">
                  <div className="flex flex-col items-end">
                    <span className="text-xs font-medium text-foreground leading-none">{session.user.name}</span>
                    <span className="text-[10px] text-muted leading-none mt-1">{session.user.email}</span>
                  </div>
                  <form
                    action={async () => {
                      "use server"
                      await signOut()
                    }}
                  >
                    <button
                      type="submit"
                      className="text-xs px-3 py-1.5 bg-surface hover:bg-surface-hover text-muted-foreground hover:text-foreground border border-border rounded-lg transition-all"
                    >
                      Sign Out
                    </button>
                  </form>
                </div>
              )}
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-6 py-8">
          {children}
        </main>
      </body>
    </html>
  );
}
