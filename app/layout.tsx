import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <nav className="border-b border-border sticky top-0 z-50 bg-background/80 backdrop-blur-xl">
          <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
            <a href="/" className="flex items-center gap-2 text-foreground font-semibold text-lg tracking-tight">
              <span className="w-2 h-2 rounded-full bg-accent animate-pulse-dot" />
              Threads Monitor
            </a>
            <div className="flex items-center gap-4 text-sm text-muted">
              <a href="/" className="hover:text-foreground transition-colors">Workspaces</a>
              <span className="text-border">|</span>
              <span className="font-mono text-xs">v0.2.0</span>
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
