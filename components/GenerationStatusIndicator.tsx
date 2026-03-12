"use client";

import { useEffect, useState } from "react";

interface GenerationStatus {
    id: string;
    status: "DISCOVERING" | "SYNTHESIZING" | "TRANSLATING" | "REVIEWING" | "COMPLETED" | "ERROR";
    currentStep: number;
    totalSteps: number;
    currentTopic?: string;
    progress: number;
    articlesCreated: number;
    startedAt: string;
    elapsed: string;
    errorMessage?: string;
    metadata?: Record<string, any>;
}

interface GenerationHistoryItem {
    id: string;
    status: string;
    articlesCreated: number;
    startedAt: string;
    completedAt?: string;
    duration?: number;
    errorMessage?: string;
}

interface GenerationStatusResponse {
    active: GenerationStatus | null;
    recent: GenerationHistoryItem[];
}

interface Props {
    workspaceId: string;
    refreshInterval?: number; // milliseconds, default 3000
}

const statusEmoji: Record<string, string> = {
    DISCOVERING: "🔍",
    SYNTHESIZING: "🧠",
    TRANSLATING: "🌐",
    REVIEWING: "✅",
    COMPLETED: "✅",
    ERROR: "❌"
};

const statusLabel: Record<string, string> = {
    DISCOVERING: "Discovering trending topics",
    SYNTHESIZING: "Synthesizing article",
    TRANSLATING: "Translating content",
    REVIEWING: "Reviewing for approval",
    COMPLETED: "Completed",
    ERROR: "Failed"
};

export default function GenerationStatusIndicator({ workspaceId, refreshInterval = 3000 }: Props) {
    const [status, setStatus] = useState<GenerationStatusResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let intervalId: NodeJS.Timeout;

        const fetchStatus = async () => {
            try {
                const res = await fetch(`/api/workspaces/${workspaceId}/generation-status`);

                if (!res.ok) {
                    if (res.status === 401 || res.status === 403) {
                        setError("Unauthorized");
                        return;
                    }
                    throw new Error(`HTTP ${res.status}`);
                }

                const data: GenerationStatusResponse = await res.json();
                setStatus(data);
                setError(null);

                // If there's an active generation, keep polling
                // If completed/no active, slow down polling
                if (data.active && data.active.status !== "COMPLETED" && data.active.status !== "ERROR") {
                    // Active generation - keep fast polling
                } else if (intervalId) {
                    // No active generation - we can stop aggressive polling
                    clearInterval(intervalId);
                    intervalId = setInterval(fetchStatus, 30000); // Check every 30s for new runs
                }
            } catch (err) {
                console.error("[GenerationStatus] Fetch error:", err);
                setError(err instanceof Error ? err.message : String(err));
            } finally {
                setIsLoading(false);
            }
        };

        // Initial fetch
        fetchStatus();

        // Set up polling
        intervalId = setInterval(fetchStatus, refreshInterval);

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [workspaceId, refreshInterval]);

    if (error === "Unauthorized") {
        return null; // User not authorized, don't show anything
    }

    if (isLoading && !status) {
        return (
            <div className="rounded-lg border border-border bg-card/50 p-4">
                <div className="animate-pulse flex items-center gap-2">
                    <div className="h-4 w-4 bg-muted rounded"></div>
                    <div className="h-4 w-48 bg-muted rounded"></div>
                </div>
            </div>
        );
    }

    // Show active generation
    if (status?.active && status.active.status !== "COMPLETED") {
        const { active } = status;
        const emoji = statusEmoji[active.status] || "⏳";
        const label = statusLabel[active.status] || active.status;

        return (
            <div className="rounded-lg border border-primary/30 bg-gradient-to-r from-primary/5 to-transparent p-4 space-y-3">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className="text-xl animate-pulse">{emoji}</span>
                        <div>
                            <p className="font-medium text-foreground">{label}</p>
                            {active.currentTopic && (
                                <p className="text-sm text-muted truncate max-w-md">
                                    {active.currentTopic}
                                </p>
                            )}
                        </div>
                    </div>
                    <div className="text-right">
                        <p className="text-xs text-muted">
                            Step {active.currentStep}/{active.totalSteps}
                        </p>
                        <p className="text-xs font-mono text-muted">{active.elapsed}</p>
                    </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                        <span className="text-muted">Progress</span>
                        <span className="font-mono text-foreground">{active.progress}%</span>
                    </div>
                    <div className="h-2 bg-muted/30 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-primary transition-all duration-500 ease-out rounded-full"
                            style={{ width: `${active.progress}%` }}
                        />
                    </div>
                </div>

                {/* Articles Created */}
                {active.articlesCreated > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                        <span className="text-success">✓</span>
                        <span className="text-muted">
                            {active.articlesCreated} article{active.articlesCreated !== 1 ? 's' : ''} created
                        </span>
                    </div>
                )}

                {/* Error Message */}
                {active.status === "ERROR" && active.errorMessage && (
                    <div className="text-sm text-error bg-error/10 border border-error/30 rounded p-2">
                        {active.errorMessage}
                    </div>
                )}
            </div>
        );
    }

    // Show recent history (last completed run)
    if (status?.recent && status.recent.length > 0) {
        const lastRun = status.recent[0];
        const wasSuccess = lastRun.status === "COMPLETED";
        const timeSince = lastRun.completedAt
            ? formatTimeSince(new Date(lastRun.completedAt))
            : null;

        return (
            <div className="rounded-lg border border-border bg-card/30 p-3">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm">
                        <span>{wasSuccess ? "✅" : "❌"}</span>
                        <span className="text-muted">
                            Last generation: {wasSuccess
                                ? `${lastRun.articlesCreated} article${lastRun.articlesCreated !== 1 ? 's' : ''} created`
                                : "Failed"
                            }
                        </span>
                    </div>
                    {timeSince && (
                        <span className="text-xs text-muted font-mono">{timeSince}</span>
                    )}
                </div>
                {!wasSuccess && lastRun.errorMessage && (
                    <p className="text-xs text-error mt-1">{lastRun.errorMessage}</p>
                )}
            </div>
        );
    }

    return null;
}

function formatTimeSince(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);

    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    return `${days}d ago`;
}
