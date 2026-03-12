"use client";

import { useState } from "react";

export default function YouTubeCookiesPage() {
    const [cookies, setCookies] = useState("");
    const [status, setStatus] = useState<{ type: "success" | "error" | "info", message: string, commands?: string[] } | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isTesting, setIsTesting] = useState(false);

    const copyToClipboard = async (text: string) => {
        try {
            await navigator.clipboard.writeText(text);
            alert("Copied to clipboard!");
        } catch (err) {
            console.error("Failed to copy:", err);
        }
    };

    const handleTest = async () => {
        if (!cookies.trim()) {
            setStatus({ type: "error", message: "Please paste the cookies first" });
            return;
        }

        setIsTesting(true);
        setStatus({ type: "info", message: "🔍 Validating cookie format..." });

        try {
            const response = await fetch("/api/admin/youtube-cookies/test", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cookies: cookies.trim() })
            });

            const data = await response.json();

            if (data.success) {
                setStatus({
                    type: "success",
                    message: data.message
                });
            } else {
                setStatus({ type: "error", message: data.error });
            }
        } catch (error) {
            setStatus({ type: "error", message: "Network error during validation - please try again" });
        } finally {
            setIsTesting(false);
        }
    };

    const handleSave = async () => {
        if (!cookies.trim()) {
            setStatus({ type: "error", message: "Please paste the cookies first" });
            return;
        }

        setIsLoading(true);
        setStatus({ type: "info", message: "⏳ Saving cookies and deploying to Azure... This may take 30-60 seconds." });

        try {
            const response = await fetch("/api/admin/youtube-cookies", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ cookies: cookies.trim() })
            });

            const data = await response.json();

            if (response.ok && data.deployed) {
                setStatus({
                    type: "success",
                    message: "✅ Success! Cookies deployed to Azure automatically. YouTube videos should now work. The worker will restart in ~30 seconds."
                });
                // Clear the textarea after successful save
                setTimeout(() => setCookies(""), 3000);
            } else if (response.ok && data.commands) {
                // Manual deployment needed - show commands with copy buttons
                setStatus({
                    type: "success",
                    message: data.message,
                    commands: data.commands
                });
            } else {
                setStatus({ type: "error", message: data.error || "Failed to save cookies" });
            }
        } catch (error) {
            setStatus({ type: "error", message: "Network error - please try again" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in p-8">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold tracking-tight">YouTube Cookies Configuration</h1>
                <p className="text-muted mt-1">
                    Configure YouTube cookies to bypass bot detection for video processing
                </p>
            </div>

            {/* Status Message */}
            {status && (
                <div className={`p-4 rounded-xl border ${
                    status.type === "success" ? "bg-green-500/10 text-green-400 border-green-500/20" :
                    status.type === "error" ? "bg-red-500/10 text-red-400 border-red-500/20" :
                    "bg-blue-500/10 text-blue-400 border-blue-500/20"
                }`}>
                    <div className="text-sm mb-3">{status.message}</div>
                    {status.commands && status.commands.length > 0 && (
                        <div className="space-y-3">
                            {status.commands.map((cmd, index) => (
                                <div key={index} className="relative">
                                    <pre className="bg-background/50 border border-border rounded-lg p-3 pr-20 text-xs font-mono overflow-x-auto">{cmd}</pre>
                                    <button
                                        onClick={() => copyToClipboard(cmd)}
                                        className="absolute right-2 top-2 px-3 py-1.5 bg-accent text-accent-foreground text-xs rounded hover:opacity-90 transition-opacity"
                                    >
                                        Copy
                                    </button>
                                </div>
                            ))}
                            <p className="text-xs opacity-70 mt-3">
                                After running these commands, the worker will restart automatically with the new cookies.
                            </p>
                        </div>
                    )}
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Instructions */}
                <div className="lg:col-span-1">
                    <div className="border border-border rounded-xl p-6 bg-surface sticky top-24">
                        <h2 className="text-xl font-semibold mb-4">📋 How to Get Cookies</h2>

                        <div className="space-y-4">
                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-semibold text-sm">
                                    1
                                </div>
                                <div>
                                    <h3 className="font-medium mb-1 text-sm">Install Extension</h3>
                                    <p className="text-xs text-muted">
                                        Install <strong>"Get cookies.txt LOCALLY"</strong>:
                                    </p>
                                    <ul className="text-xs text-muted ml-3 mt-1 space-y-0.5">
                                        <li>• <a href="https://chrome.google.com/webstore/detail/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" className="text-accent hover:underline">Chrome/Edge</a></li>
                                        <li>• <a href="https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/" target="_blank" className="text-accent hover:underline">Firefox</a></li>
                                    </ul>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-semibold text-sm">
                                    2
                                </div>
                                <div>
                                    <h3 className="font-medium mb-1 text-sm">Log Into YouTube</h3>
                                    <p className="text-xs text-muted">
                                        Go to <a href="https://www.youtube.com" target="_blank" className="text-accent hover:underline">youtube.com</a> and log in
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-semibold text-sm">
                                    3
                                </div>
                                <div>
                                    <h3 className="font-medium mb-1 text-sm">Export Cookies</h3>
                                    <p className="text-xs text-muted">
                                        Click extension icon → <strong>"Export"</strong>
                                    </p>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent/20 text-accent flex items-center justify-center font-semibold text-sm">
                                    4
                                </div>
                                <div>
                                    <h3 className="font-medium mb-1 text-sm">Paste Below</h3>
                                    <p className="text-xs text-muted">
                                        Copy all text and paste in the box →
                                    </p>
                                </div>
                            </div>
                        </div>

                        {/* Info Box */}
                        <div className="mt-6 pt-6 border-t border-border">
                            <h3 className="font-medium text-sm mb-2">🔒 Privacy & Security</h3>
                            <ul className="text-xs text-muted space-y-1">
                                <li>• Stored securely in Azure</li>
                                <li>• Only for video processing</li>
                                <li>• Refresh every 3-6 months</li>
                            </ul>
                        </div>
                    </div>
                </div>

                {/* Cookie Input */}
                <div className="lg:col-span-2">
                    <div className="border border-border rounded-xl p-6 bg-surface">
                        <label htmlFor="cookies" className="block text-sm font-medium mb-2 grayscale opacity-70">
                            Paste Your YouTube Cookies Here
                        </label>
                        <textarea
                            id="cookies"
                            value={cookies}
                            onChange={(e) => setCookies(e.target.value)}
                            placeholder="# Netscape HTTP Cookie File
.youtube.com	TRUE	/	TRUE	1234567890	VISITOR_INFO1_LIVE	abc123...
.youtube.com	TRUE	/	TRUE	1234567890	YSC	def456...
..."
                            className="w-full h-80 bg-background border border-border rounded-lg px-4 py-3 font-mono text-xs focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-200 outline-none resize-none"
                            disabled={isLoading}
                        />
                        <p className="text-xs text-muted mt-2">
                            Should start with "# Netscape HTTP Cookie File" and contain youtube.com entries
                        </p>

                        <div className="mt-6 flex gap-3">
                            <button
                                onClick={handleTest}
                                disabled={isTesting || isLoading || !cookies.trim()}
                                className="px-6 py-2.5 bg-background border border-border text-sm font-medium rounded-lg hover:bg-surface hover:border-accent disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                            >
                                {isTesting ? "Validating..." : "🔍 Validate Format"}
                            </button>

                            <button
                                onClick={handleSave}
                                disabled={isLoading || isTesting || !cookies.trim()}
                                className="px-6 py-2.5 bg-accent text-accent-foreground text-sm font-medium rounded-lg hover:opacity-90 disabled:opacity-30 disabled:cursor-not-allowed transition-all duration-200"
                            >
                                {isLoading ? "Deploying..." : "✅ Save & Deploy to Azure"}
                            </button>
                        </div>

                        <p className="text-xs text-muted mt-3">
                            💡 Tip: Validate format first, then deploy. Test with a real video after deployment.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
