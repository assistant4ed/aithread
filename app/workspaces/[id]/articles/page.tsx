
"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface SynthesizedArticle {
    id: string;
    topicName: string;
    articleContent: string;
    articleOriginal: string | null;
    sourcePostIds: string[];
    sourceAccounts: string[];
    authorCount: number;
    postCount: number;
    status: string;
    publishedUrl: string | null;
    createdAt: string;
    mediaUrls?: any[];
}

const STATUS_TABS = ["ALL", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "ERROR"] as const;

export default function ArticlesPage() {
    const params = useParams();
    const workspaceId = params.id as string;
    const [articles, setArticles] = useState<SynthesizedArticle[]>([]);
    const [total, setTotal] = useState(0);
    const [activeTab, setActiveTab] = useState<string>("PENDING_REVIEW");
    const [loading, setLoading] = useState(true);

    const fetchArticles = useCallback(async () => {
        setLoading(true);
        const status = activeTab === "ALL" ? "" : activeTab;
        const qs = new URLSearchParams({
            workspaceId,
            ...(status && { status }),
            limit: "50",
            // Sorting is handled by default (createdAt desc)
        });
        const res = await fetch(`/api/articles?${qs}`);
        const data = await res.json();
        setArticles(data.articles);
        setTotal(data.total);
        setLoading(false);
    }, [workspaceId, activeTab]);

    useEffect(() => {
        fetchArticles();

        // Polling: refresh every 60 seconds
        const interval = setInterval(() => {
            fetchArticles();
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchArticles]);

    const updateStatus = async (articleId: string, newStatus: string) => {
        await fetch(`/api/articles/${articleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        });
        fetchArticles();
    };

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex items-end justify-between">
                <div>
                    <a
                        href={`/workspaces/${workspaceId}`}
                        className="text-sm text-muted hover:text-foreground transition-colors"
                    >
                        ← Back to Workspace
                    </a>
                    <h1 className="text-2xl font-bold tracking-tight mt-1">Article Review Queue</h1>
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-sm text-muted">{total} articles</span>
                </div>
            </div>

            {/* Status Tabs */}
            <div className="flex gap-1 bg-surface rounded-lg p-1 border border-border">
                {STATUS_TABS.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`flex-1 text-xs font-mono py-2 px-3 rounded-md transition-colors ${activeTab === tab
                            ? "bg-accent text-white"
                            : "text-muted hover:text-foreground"
                            }`}
                    >
                        {tab.replace("_", " ")}
                    </button>
                ))}
            </div>

            {/* Articles */}
            {loading ? (
                <div className="text-center py-12 text-muted">Loading...</div>
            ) : articles.length === 0 ? (
                <div className="border border-dashed border-border rounded-xl p-12 text-center">
                    <p className="text-muted">No articles with status &quot;{activeTab}&quot;</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {articles.map((article) => (
                        <div
                            key={article.id}
                            className="border border-border rounded-xl p-5 hover:border-accent/30 transition-colors"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-bold text-accent">{article.topicName}</span>
                                    <StatusBadge status={article.status} />
                                </div>
                                <span className="text-xs text-muted">
                                    {new Date(article.createdAt).toLocaleString()}
                                </span>
                            </div>

                            {/* Content */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                <div>
                                    <p className="text-xs text-muted mb-2 font-mono uppercase">Synthesized Article (Traditional Chinese)</p>
                                    <div className="text-sm text-foreground whitespace-pre-wrap bg-surface/50 p-4 rounded-lg border border-border">
                                        {article.articleContent}
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-muted mb-2 font-mono uppercase">Metadata & Media</p>
                                    <div className="space-y-4">
                                        <div className="text-xs text-muted space-y-1">
                                            <p>Sources: <span className="text-foreground">{article.authorCount} distinct authors</span></p>
                                            <p>Post Volume: <span className="text-foreground">{article.postCount} posts</span></p>
                                            <p>Authors: {article.sourceAccounts.map(a => `@${a}`).join(", ")}</p>
                                        </div>

                                        {/* Media Preview */}
                                        {article.mediaUrls && article.mediaUrls.length > 0 && (
                                            <div className="grid grid-cols-3 gap-2">
                                                {article.mediaUrls.slice(0, 3).map((m, i) => (
                                                    <a key={i} href={m.url} target="_blank" rel="noopener" className="block aspect-square relative bg-black rounded overflow-hidden group">
                                                        {m.type === "video" ? (
                                                            <div className="w-full h-full flex items-center justify-center text-white bg-gray-800">▶</div>
                                                        ) : (
                                                            <div
                                                                className="w-full h-full bg-cover bg-center"
                                                                style={{ backgroundImage: `url(${m.url})` }}
                                                            />
                                                        )}
                                                    </a>
                                                ))}
                                                {article.mediaUrls.length > 3 && (
                                                    <div className="flex items-center justify-center bg-surface border border-border rounded text-xs text-muted">
                                                        +{article.mediaUrls.length - 3} more
                                                    </div>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-center justify-between border-t border-border pt-4 mt-4">
                                <div className="text-xs text-muted">
                                    {article.publishedUrl && (
                                        <a href={article.publishedUrl} target="_blank" rel="noopener" className="text-success hover:underline">
                                            View Published Post ↗
                                        </a>
                                    )}
                                </div>
                                <div className="flex gap-2">
                                    {article.status === "PENDING_REVIEW" && (
                                        <>
                                            <button
                                                onClick={() => updateStatus(article.id, "APPROVED")}
                                                className="px-4 py-1.5 rounded-lg bg-success text-white hover:bg-success-hover transition-colors text-sm font-medium shadow-sm"
                                            >
                                                Approve & Publish
                                            </button>
                                            <button
                                                onClick={() => updateStatus(article.id, "REJECTED")}
                                                className="px-4 py-1.5 rounded-lg border border-border text-muted hover:bg-surface-hover hover:text-foreground transition-colors text-sm"
                                            >
                                                Reject
                                            </button>
                                        </>
                                    )}
                                    {article.status === "APPROVED" && (
                                        <span className="text-sm text-accent font-mono animate-pulse">
                                            Publishing in progress...
                                        </span>
                                    )}
                                    {article.status === "ERROR" && (
                                        <button
                                            onClick={() => updateStatus(article.id, "APPROVED")}
                                            className="px-4 py-1.5 rounded-lg bg-warning text-white hover:bg-warning/80 transition-colors text-sm font-medium"
                                        >
                                            Retry
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const styles: Record<string, string> = {
        PENDING_REVIEW: "bg-warning/10 text-warning border-warning/30",
        APPROVED: "bg-accent/10 text-accent border-accent/30",
        PUBLISHED: "bg-success/10 text-success border-success/30",
        REJECTED: "bg-muted/10 text-muted border-border",
        ERROR: "bg-danger/10 text-danger border-danger/30",
    };

    return (
        <span
            className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${styles[status] || styles.PENDING_REVIEW}`}
        >
            {status}
        </span>
    );
}
