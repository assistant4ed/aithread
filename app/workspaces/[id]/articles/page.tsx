
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
    sourcePosts?: { id: string; sourceAccount: string; sourceUrl: string | null }[];
    authorCount: number;
    postCount: number;
    status: string;
    publishedUrl: string | null;
    publishedUrlInstagram?: string | null;
    publishedUrlTwitter?: string | null;
    createdAt: string;
    mediaUrls?: any[];
    selectedMediaUrl?: string | null;
    selectedMediaType?: string | null;
    scheduledPublishAt?: string | null;
    externalUrls?: string[];
    views: number;
    likes: number;
    replies: number;
    reposts: number;
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
                                        <div className="flex items-center gap-3 mt-1.5 font-mono text-[10px] text-muted-foreground">
                                            <span className="bg-surface px-1.5 py-0.5 rounded border border-border">📊 {article.views.toLocaleString()} views</span>
                                            <span className="bg-surface px-1.5 py-0.5 rounded border border-border">❤️ {article.likes.toLocaleString()} likes</span>
                                            <span className="bg-surface px-1.5 py-0.5 rounded border border-border">💬 {article.replies.toLocaleString()} replies</span>
                                            <span className="bg-surface px-1.5 py-0.5 rounded border border-border">🔄 {article.reposts.toLocaleString()} reposts</span>
                                        </div>
                                    </div>
                                    {article.sourcePosts && article.sourcePosts.length > 0 && (
                                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
                                            {article.sourcePosts.map((p) =>
                                                p.sourceUrl ? (
                                                    <a
                                                        key={p.id}
                                                        href={p.sourceUrl}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="text-xs text-accent hover:underline font-mono"
                                                    >
                                                        @{p.sourceAccount} ↗
                                                    </a>
                                                ) : (
                                                    <span key={p.id} className="text-xs text-muted font-mono">
                                                        @{p.sourceAccount}
                                                    </span>
                                                )
                                            )}
                                        </div>
                                    )}
                                    {article.externalUrls && article.externalUrls.length > 0 && (
                                        <div className="mt-3 pt-2 border-t border-dashed border-border/50">
                                            <p className="text-[10px] text-muted mb-1 font-mono uppercase">References</p>
                                            <ul className="text-xs space-y-1">
                                                {article.externalUrls.map((url, i) => (
                                                    <li key={i} className="truncate">
                                                        <a
                                                            href={url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="text-accent hover:underline flex items-center gap-1"
                                                            title={url}
                                                        >
                                                            <span className="opacity-50">🔗</span>
                                                            {url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 40)}{url.length > 40 ? '...' : ''}
                                                        </a>
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    )}
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
                                        {/* Media Preview (Candidates) - Hide if PUBLISHED */}
                                        {article.status !== "PUBLISHED" && (
                                            <div className="grid grid-cols-4 gap-2">
                                                {(() => {
                                                    const allMedia = [...(article.mediaUrls || [])];
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
                                        )}

                                        {/* Final Selected Media Display (Always allow seeing what was picked/published) */}
                                        {article.selectedMediaUrl && (
                                            <div className={`mt-2 flex items-center gap-2 bg-surface/30 p-2 rounded ${article.status === "PUBLISHED" ? "border border-success/30 bg-success/5" : ""}`}>
                                                <span className="text-xs text-muted w-16 px-1">{article.status === "PUBLISHED" ? "Published:" : "Selected:"}</span>
                                                {article.selectedMediaType === "video" ? (
                                                    <div className="h-16 w-16 bg-gray-900 flex items-center justify-center rounded text-white text-xs">▶ Video</div>
                                                ) : (
                                                    <div className="h-16 w-16 rounded bg-cover bg-center" style={{ backgroundImage: `url(${article.selectedMediaUrl})` }}></div>
                                                )}
                                                <a href={article.selectedMediaUrl} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline truncate flex-1 opacity-70">
                                                    {article.selectedMediaUrl.split('/').pop()}
                                                </a>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex items-end justify-between border-t border-border pt-4 mt-4">
                                <div className="text-xs text-muted flex flex-col gap-1.5">
                                    {(article.publishedUrl || article.publishedUrlInstagram || article.publishedUrlTwitter) && (
                                        <div className="flex flex-col gap-1">
                                            {article.publishedUrl && (
                                                <a href={article.publishedUrl} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-foreground/80 hover:text-accent font-medium">
                                                    <span>Threads</span>
                                                    <span className="text-[10px] opacity-70">↗</span>
                                                </a>
                                            )}
                                            {article.publishedUrlInstagram && (
                                                <a href={article.publishedUrlInstagram} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-foreground/80 hover:text-purple-400 font-medium">
                                                    <span>Instagram</span>
                                                    <span className="text-[10px] opacity-70">↗</span>
                                                </a>
                                            )}
                                            {article.publishedUrlTwitter && (
                                                <a href={article.publishedUrlTwitter} target="_blank" rel="noopener" className="flex items-center gap-1.5 text-foreground/80 hover:text-blue-400 font-medium">
                                                    <span>X (Twitter)</span>
                                                    <span className="text-[10px] opacity-70">↗</span>
                                                </a>
                                            )}
                                        </div>
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
                                            <a
                                                href={`/workspaces/${workspaceId}/articles/${article.id}/edit`}
                                                className="px-4 py-1.5 rounded-lg border border-accent/30 text-accent hover:bg-accent/10 transition-colors text-sm font-medium"
                                            >
                                                Edit Draft
                                            </a>
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
