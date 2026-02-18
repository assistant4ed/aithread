
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
    selectedMediaUrl?: string | null;
    selectedMediaType?: string | null;
    scheduledPublishAt?: string | null;
}

const STATUS_TABS = ["ALL", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "ERROR"] as const;

export default function ArticlesPage() {
    const params = useParams();
    const workspaceId = params.id as string;
    const [articles, setArticles] = useState<SynthesizedArticle[]>([]);
    const [total, setTotal] = useState(0);
    const [activeTab, setActiveTab] = useState<string>("PENDING_REVIEW");
    const [loading, setLoading] = useState(true);
    const [uploadingId, setUploadingId] = useState<string | null>(null);

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

    const handleMediaSelect = async (articleId: string, url: string, type: "image" | "video") => {
        // Optimistic update
        setArticles(prev => prev.map(a =>
            a.id === articleId ? { ...a, selectedMediaUrl: url, selectedMediaType: type } : a
        ));

        await fetch(`/api/articles/${articleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ selectedMediaUrl: url, selectedMediaType: type }),
        });
    };

    const handleFileUpload = async (articleId: string, file: File) => {
        setUploadingId(articleId);
        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch(`/api/articles/${articleId}/upload-media`, {
                method: "POST",
                body: formData,
            });
            const data = await res.json();

            if (data.url) {
                // Find article to get current mediaUrls
                const article = articles.find(a => a.id === articleId);
                if (!article) return;

                const newMedia = { url: data.url, type: data.type };
                const updatedMediaUrls = [...(article.mediaUrls || []), newMedia];

                // Optimistic update
                setArticles(prev => prev.map(a =>
                    a.id === articleId ? {
                        ...a,
                        selectedMediaUrl: data.url,
                        selectedMediaType: data.type,
                        mediaUrls: updatedMediaUrls
                    } : a
                ));

                // Persist
                const patchRes = await fetch(`/api/articles/${articleId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        selectedMediaUrl: data.url,
                        selectedMediaType: data.type,
                        mediaUrls: updatedMediaUrls
                    }),
                });

                if (!patchRes.ok) {
                    throw new Error("Failed to save media selection");
                }
            }
        } catch (e: any) {
            console.error("Upload/Save failed", e);
            alert(`Upload failed: ${e.message}`);
            fetchArticles(); // Revert state
        } finally {
            setUploadingId(null);
        }
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
                            className={`border rounded-xl p-5 hover:border-accent/30 transition-colors ${article.status === "PUBLISHED" ? "border-success/30 bg-success/5" : "border-border"
                                }`}
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-base font-bold text-accent">{article.topicName}</span>
                                    <StatusBadge status={article.status} />
                                </div>
                                <div className="text-right text-xs text-muted flex flex-col gap-0.5">
                                    <span>Generated: {new Date(article.createdAt).toLocaleString()}</span>
                                    {article.scheduledPublishAt && (
                                        <span className="text-success font-medium">
                                            Scheduled: {new Date(article.scheduledPublishAt).toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-4">
                                <div>
                                    <p className="text-xs text-muted mb-2 font-mono uppercase">Synthesized Article (Traditional Chinese)</p>
                                    <div className="text-sm text-foreground whitespace-pre-wrap bg-surface/50 p-4 rounded-lg border border-border min-h-[120px]">
                                        {article.articleContent}
                                    </div>
                                    <div className="mt-2 text-xs text-muted">
                                        Sources: {article.authorCount} distinct authors, {article.postCount} posts
                                    </div>
                                </div>
                                <div>
                                    <div className="flex items-center justify-between mb-2">
                                        <p className="text-xs text-muted font-mono uppercase">Media Selection</p>
                                        <label className="text-xs text-accent cursor-pointer hover:underline">
                                            {uploadingId === article.id ? "Uploading..." : "+ Upload Custom"}
                                            <input
                                                type="file"
                                                className="hidden"
                                                accept="image/*,video/*"
                                                onChange={(e) => {
                                                    if (e.target.files && e.target.files[0]) {
                                                        handleFileUpload(article.id, e.target.files[0]);
                                                    }
                                                }}
                                            />
                                        </label>
                                    </div>

                                    <div className="space-y-4">
                                        {/* Media Preview */}
                                        <div className="grid grid-cols-4 gap-2">
                                            {/* Combined list: custom media + source media */}
                                            {(() => {
                                                const allMedia = [...(article.mediaUrls || [])];
                                                // If custom media is selected but not in the list, just treat it as the selected state
                                                // Actually we want to show the list of OPTIONS.
                                                // The selected one gets a border.

                                                // If we uploaded custom media, it should be in `selectedMediaUrl`. 
                                                // We can display it as a special "Selected" preview if it's not in the list.
                                                return allMedia.slice(0, 8).map((m, i) => {
                                                    const url = typeof m === "string" ? m : m.url;
                                                    const type = typeof m === "string" ? "image" : m.type;
                                                    const isSelected = article.selectedMediaUrl === url;

                                                    return (
                                                        <div
                                                            key={i}
                                                            onClick={() => handleMediaSelect(article.id, url, type)}
                                                            className={`relative aspect-square rounded overflow-hidden cursor-pointer border-2 transition-all ${isSelected ? "border-accent ring-2 ring-accent/20" : "border-transparent opacity-70 hover:opacity-100"
                                                                }`}
                                                        >
                                                            {type === "video" ? (
                                                                <div className="w-full h-full flex items-center justify-center bg-gray-900 text-white text-xs">▶</div>
                                                            ) : (
                                                                <div
                                                                    className="w-full h-full bg-cover bg-center"
                                                                    style={{ backgroundImage: `url(${url})` }}
                                                                />
                                                            )}
                                                            {isSelected && (
                                                                <div className="absolute top-1 right-1 w-2 h-2 bg-accent rounded-full mb-0.5"></div>
                                                            )}
                                                        </div>
                                                    );
                                                });
                                            })()}
                                        </div>

                                        {/* Show currently selected larger preview if exists */}
                                        {article.selectedMediaUrl && (
                                            <div className="mt-2 text-xs text-muted flex items-center gap-2 bg-surface/30 p-2 rounded">
                                                <span>Selected:</span>
                                                <div className="h-8 w-8 rounded bg-cover bg-center" style={{ backgroundImage: `url(${article.selectedMediaUrl})` }}></div>
                                                <span className="truncate flex-1 opacity-50">{article.selectedMediaUrl}</span>
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
