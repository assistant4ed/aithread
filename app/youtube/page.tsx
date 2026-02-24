"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface JobData {
    id: string;
    videoUrl: string;
    language: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    pdfUrl?: string | null;
    error?: string | null;
    createdAt: string;
    videoId?: string | null;
}

export default function YoutubeAutomationPage() {
    const [videoUrl, setVideoUrl] = useState("");
    const [language, setLanguage] = useState("zh-HK");
    const [includeFrames, setIncludeFrames] = useState(true);
    const [isLoading, setIsLoading] = useState(false);
    const [jobs, setJobs] = useState<JobData[]>([]);
    const [error, setError] = useState<string | null>(null);

    const fetchJobs = async () => {
        try {
            const res = await fetch("/api/youtube/jobs");
            const data = await res.json();
            if (data.jobs) {
                setJobs(data.jobs);
            }
        } catch (err) {
            console.error("Failed to fetch jobs:", err);
        }
    };

    useEffect(() => {
        fetchJobs();
        const interval = setInterval(fetchJobs, 3000);
        return () => clearInterval(interval);
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsLoading(true);
        setError(null);

        try {
            const res = await fetch("/api/youtube/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ videoUrl, language, includeFrames }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Failed to queue job");

            setVideoUrl("");
            fetchJobs();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">YouTube Automation</h1>
                <p className="text-muted mt-1">Extract transcripts, generate scripts with Gemini, and create professional PDFs.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Submit Form */}
                <div className="lg:col-span-1">
                    <div className="border border-border rounded-xl p-6 bg-surface sticky top-24">
                        <h2 className="text-xl font-semibold mb-4">New Processing Job</h2>
                        <form onSubmit={handleSubmit} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-1.5 grayscale opacity-70">YouTube Video URL</label>
                                <input
                                    type="text"
                                    value={videoUrl}
                                    onChange={(e) => setVideoUrl(e.target.value)}
                                    placeholder="https://www.youtube.com/watch?v=..."
                                    className="w-full bg-background border border-border rounded-lg px-4 py-2 text-sm focus:border-accent focus:ring-1 focus:ring-accent transition-all duration-200 outline-none"
                                    required
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-medium mb-1.5 grayscale opacity-70">Language</label>
                                    <select
                                        value={language}
                                        onChange={(e) => setLanguage(e.target.value)}
                                        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:border-accent outline-none"
                                    >
                                        <option value="zh-HK">Cantonese (zh-HK)</option>
                                        <option value="en">English (en)</option>
                                        <option value="zh-TW">Traditional Chinese (zh-TW)</option>
                                    </select>
                                </div>
                                <div className="flex items-center gap-2 pt-6">
                                    <input
                                        type="checkbox"
                                        id="frames"
                                        checked={includeFrames}
                                        onChange={(e) => setIncludeFrames(e.target.checked)}
                                        className="w-4 h-4 accent-accent"
                                    />
                                    <label htmlFor="frames" className="text-sm font-medium opacity-70 cursor-pointer">Include Frames</label>
                                </div>
                            </div>

                            {error && (
                                <div className="p-3 bg-danger/10 border border-danger/20 text-danger text-xs rounded-lg">
                                    {error}
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={isLoading}
                                className="w-full py-2.5 bg-accent hover:bg-accent-hover text-white font-medium rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-accent/20"
                            >
                                {isLoading ? "Queuing..." : "Process Video"}
                            </button>
                        </form>
                    </div>
                </div>

                {/* Jobs List */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-semibold">Recent Processing Jobs</h2>

                    {jobs.length === 0 ? (
                        <div className="border border-dashed border-border rounded-xl p-12 text-center">
                            <p className="text-muted">No jobs in the queue</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {jobs.map((job) => (
                                <div key={job.id} className="border border-border rounded-xl p-4 bg-surface hover:border-accent/30 transition-all duration-200">
                                    <div className="flex items-start justify-between gap-4">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded uppercase ${job.status === 'COMPLETED' ? 'bg-success/10 text-success border border-success/20' :
                                                    job.status === 'FAILED' ? 'bg-danger/10 text-danger border border-danger/20' :
                                                        job.status === 'PROCESSING' || job.status === 'PENDING' ? 'bg-accent/10 text-accent border border-accent/20 animate-pulse' :
                                                            'bg-muted/10 text-muted border border-muted/20'
                                                    }`}>
                                                    {job.status}
                                                </span>
                                                <span className="text-[10px] text-muted font-mono">ID: {job.id}</span>
                                                <span className="text-[10px] text-muted">·</span>
                                                <span className="text-[10px] text-muted">{new Date(job.createdAt).toLocaleString()}</span>
                                            </div>
                                            <p className="text-sm font-medium text-foreground truncate">{job.videoUrl}</p>
                                        </div>

                                        {job.status === 'COMPLETED' && job.videoId && (
                                            <a
                                                href={`/api/youtube/download/${job.videoId}?lang=${job.language}`}
                                                className="shrink-0 px-3 py-1.5 bg-accent/10 hover:bg-accent/20 text-accent text-xs font-semibold rounded-lg border border-accent/20 transition-all"
                                            >
                                                Download PDF
                                            </a>
                                        )}
                                    </div>

                                    {/* Progress Bar (Simulated or based on status) */}
                                    {(job.status === 'PROCESSING' || job.status === 'COMPLETED') && (
                                        <div className="mt-3">
                                            <div className="flex items-center justify-between text-[10px] text-muted mb-1">
                                                <span>{job.status === 'COMPLETED' ? '100%' : 'Processing %'}</span>
                                                <span>{job.status === 'COMPLETED' ? 'Finished' : 'Processing...'}</span>
                                            </div>
                                            <div className="h-1.5 w-full bg-background rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full bg-accent transition-all duration-500 rounded-full shadow-[0_0_8px_rgba(var(--accent-rgb),0.5)] ${job.status === 'PROCESSING' ? 'w-1/2 animate-pulse' : 'w-full'}`}
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {job.status === 'FAILED' && (
                                        <div className="mt-2 text-[10px] text-danger bg-danger/5 p-2 rounded border border-danger/10">
                                            Error: {job.error || "Unknown error"}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
