"use client";

import { useState } from "react";

export default function YouTubeCookiesPage() {
    const [cookies, setCookies] = useState("");
    const [status, setStatus] = useState<{ type: "success" | "error" | "info", message: string } | null>(null);
    const [isLoading, setIsLoading] = useState(false);

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
                    message: "✅ Success! Cookies deployed to Azure. YouTube videos should now work. The worker will restart automatically (takes ~30 seconds)."
                });
                // Clear the textarea after successful save
                setTimeout(() => setCookies(""), 3000);
            } else if (data.manualInstructions) {
                // Automatic deployment failed, show manual instructions
                setStatus({
                    type: "error",
                    message: `Automatic deployment failed. ${data.error}\n\nManual steps:\n${data.manualInstructions.join("\n")}`
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
        <div className="min-h-screen bg-gray-50 p-8">
            <div className="max-w-4xl mx-auto">
                <h1 className="text-3xl font-bold mb-2">YouTube Cookies Configuration</h1>
                <p className="text-gray-600 mb-8">
                    Configure YouTube cookies to bypass bot detection for video processing
                </p>

                {/* Status Message */}
                {status && (
                    <div className={`mb-6 p-4 rounded-lg ${
                        status.type === "success" ? "bg-green-50 text-green-800 border border-green-200" :
                        status.type === "error" ? "bg-red-50 text-red-800 border border-red-200" :
                        "bg-blue-50 text-blue-800 border border-blue-200"
                    }`}>
                        {status.message}
                    </div>
                )}

                {/* Instructions */}
                <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                    <h2 className="text-xl font-semibold mb-4">📋 How to Get Your YouTube Cookies</h2>

                    <div className="space-y-4">
                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-semibold">
                                1
                            </div>
                            <div>
                                <h3 className="font-medium mb-1">Install Cookie Extension</h3>
                                <p className="text-sm text-gray-600">
                                    Install <strong>"Get cookies.txt LOCALLY"</strong> extension:
                                </p>
                                <ul className="text-sm text-gray-600 ml-4 mt-2 space-y-1">
                                    <li>• Chrome/Edge: <a href="https://chrome.google.com/webstore/detail/cclelndahbckbenkjhflpdbgdldlbecc" target="_blank" className="text-blue-600 hover:underline">Chrome Web Store Link</a></li>
                                    <li>• Firefox: <a href="https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/" target="_blank" className="text-blue-600 hover:underline">Firefox Add-ons Link</a></li>
                                </ul>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-semibold">
                                2
                            </div>
                            <div>
                                <h3 className="font-medium mb-1">Log Into YouTube</h3>
                                <p className="text-sm text-gray-600">
                                    Go to <a href="https://www.youtube.com" target="_blank" className="text-blue-600 hover:underline">youtube.com</a> and make sure you're logged in
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-semibold">
                                3
                            </div>
                            <div>
                                <h3 className="font-medium mb-1">Export Cookies</h3>
                                <p className="text-sm text-gray-600">
                                    Click the cookie extension icon in your browser toolbar and click <strong>"Export"</strong> or <strong>"Get cookies.txt"</strong>
                                </p>
                            </div>
                        </div>

                        <div className="flex gap-3">
                            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-semibold">
                                4
                            </div>
                            <div>
                                <h3 className="font-medium mb-1">Copy and Paste</h3>
                                <p className="text-sm text-gray-600">
                                    Copy all the text from the exported cookies file and paste it into the box below
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Cookie Input */}
                <div className="bg-white rounded-lg shadow-sm p-6">
                    <label htmlFor="cookies" className="block text-sm font-medium text-gray-700 mb-2">
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
                        className="w-full h-64 px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        disabled={isLoading}
                    />
                    <p className="text-xs text-gray-500 mt-2">
                        The cookies should start with "# Netscape HTTP Cookie File" and contain youtube.com entries
                    </p>

                    <button
                        onClick={handleSave}
                        disabled={isLoading || !cookies.trim()}
                        className="mt-4 px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                    >
                        {isLoading ? "Saving..." : "Save Cookies"}
                    </button>
                </div>

                {/* Info Box */}
                <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <h3 className="font-medium text-blue-900 mb-2">🔒 Privacy & Security</h3>
                    <ul className="text-sm text-blue-800 space-y-1">
                        <li>• Cookies are encrypted and stored securely in Azure</li>
                        <li>• Only used for YouTube video processing, never shared</li>
                        <li>• You may need to refresh cookies every 3-6 months if they expire</li>
                        <li>• Consider using a dedicated YouTube account for automation</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
