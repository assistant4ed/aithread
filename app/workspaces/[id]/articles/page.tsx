
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

    const deleteArticle = async (articleId: string) => {
        if (!confirm("Are you sure you want to delete this article? This cannot be undone.")) return;

        await fetch(`/api/articles/${articleId}`, {
            method: "DELETE",
        });
        fetchArticles();
    };

    const updateSchedule = async (articleId: string, scheduledDateStr: string) => {
        const scheduledPublishAt = scheduledDateStr ? new Date(scheduledDateStr).toISOString() : null;
        await fetch(`/api/articles/${articleId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ scheduledPublishAt }),
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
                            <div className="flex flex-col md:flex-row md:items-center justify-between mb-4 gap-3">
                                <div className="flex items-center gap-3">
                                    <div className="bg-accent/10 p-2 rounded-lg">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-accent"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                                    </div>
                                    <div className="flex flex-col">
                                        <div className="flex items-center gap-2">
                                            <span className="text-lg font-bold text-foreground">{article.topicName}</span>
                                            <StatusBadge status={article.status} />
                                        </div>
                                        <span className="text-xs text-muted">Created: {new Date(article.createdAt).toLocaleString()}</span>
                                    </div>
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    {article.status !== "PUBLISHED" && (
                                        <div className="flex items-center gap-2 bg-surface border border-border rounded-lg px-3 py-1.5 shadow-sm focus-within:border-accent group transition-all">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted group-focus-within:text-accent"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>
                                            <label className="text-xs font-semibold text-muted whitespace-nowrap">Schedule:</label>
                                            <input
                                                type="datetime-local"
                                                defaultValue={article.scheduledPublishAt ? new Date(new Date(article.scheduledPublishAt).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : ""}
                                                onBlur={(e) => updateSchedule(article.id, e.target.value)}
                                                className="text-xs bg-transparent border-none outline-none text-foreground font-medium p-0"
                                            />
                                        </div>
                                    )}
                                    {(article.status === "PUBLISHED" || article.status === "APPROVED") && article.scheduledPublishAt && (
                                        <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 ${article.status === "PUBLISHED"
                                                ? "bg-success/10 border border-success/30"
                                                : "bg-accent/10 border border-accent/30"
                                            }`}>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={article.status === "PUBLISHED" ? "text-success" : "text-accent"}>
                                                {article.status === "PUBLISHED" ? (
                                                    <><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></>
                                                ) : (
                                                    <><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></>
                                                )}
                                            </svg>
                                            <span className={`text-xs font-semibold uppercase ${article.status === "PUBLISHED" ? "text-success" : "text-accent"}`}>
                                                {article.status === "PUBLISHED" ? "Published" : "Scheduled"}
                                            </span>
                                            <span className={`text-xs ${article.status === "PUBLISHED" ? "text-success/80" : "text-accent/80"}`}>
                                                {new Date(article.scheduledPublishAt).toLocaleString()}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Content */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-6">
                                <div className="space-y-3">
                                    <div className="flex items-center justify-between">
                                        <p className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-1 rounded-full bg-accent"></div>
                                            Synthesized Article (TC)
                                        </p>
                                        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground bg-accent/5 px-2 py-0.5 rounded-full border border-accent/10">
                                            <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"></path></svg>
                                            {(article as any).formatUsed || "LISTICLE"}
                                        </div>
                                    </div>
                                    <div className="text-sm text-foreground leading-relaxed whitespace-pre-wrap bg-background border border-border rounded-xl p-5 min-h-[160px] shadow-inner selection:bg-accent/20">
                                        {article.articleContent}
                                    </div>
                                    <div className="flex items-center gap-4 mt-3">
                                        <div className="flex -space-x-2">
                                            {article.sourceAccounts.slice(0, 3).map((account, i) => (
                                                <div key={i} className="w-6 h-6 rounded-full bg-accent/20 border border-background flex items-center justify-center text-[8px] font-bold text-accent uppercase">
                                                    {account.slice(0, 1)}
                                                </div>
                                            ))}
                                            {article.authorCount > 3 && (
                                                <div className="w-6 h-6 rounded-full bg-surface border border-background flex items-center justify-center text-[8px] text-muted">
                                                    +{article.authorCount - 3}
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-muted-foreground italic">
                                            Aggregated from <span className="text-foreground font-semibold">{article.authorCount}</span> accounts and <span className="text-foreground font-semibold">{article.postCount}</span> posts
                                        </p>
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
                                    {article.status === "PUBLISHED" && (
                                        <div className="flex flex-col gap-3 w-full">
                                            {/* Metrics Row */}
                                            <div className="flex items-center gap-4 py-2 px-3 bg-background/50 border border-border/50 rounded-lg">
                                                <div className="flex items-center gap-1.5" title="Views">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                                                    <span className="text-foreground font-semibold">{article.views.toLocaleString()}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5" title="Likes">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-danger"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
                                                    <span className="text-foreground font-semibold">{article.likes.toLocaleString()}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5" title="Replies">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
                                                    <span className="text-foreground font-semibold">{article.replies.toLocaleString()}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5" title="Reposts">
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-success"><path d="m17 2 4 4-4 4"></path><path d="M3 11v-1a4 4 0 0 1 4-4h14"></path><path d="m7 22-4-4 4-4"></path><path d="M21 13v1a4 4 0 0 1-4 4H3"></path></svg>
                                                    <span className="text-foreground font-semibold">{article.reposts.toLocaleString()}</span>
                                                </div>
                                            </div>

                                            {/* Links Row */}
                                            <div className="flex flex-wrap gap-2">
                                                {article.publishedUrl && (
                                                    <a href={article.publishedUrl} target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-accent/40 hover:bg-accent/5 transition-all text-[11px] font-bold">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"></path><path d="M2 12h20"></path></svg>
                                                        Threads ↗
                                                    </a>
                                                )}
                                                {article.publishedUrlInstagram && (
                                                    <a href={article.publishedUrlInstagram} target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-purple-500/40 hover:bg-purple-500/5 transition-all text-[11px] font-bold">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="20" x="2" y="2" rx="5" ry="5"></rect><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path><line x1="17.5" x2="17.51" y1="6.5" y2="6.5"></line></svg>
                                                        Instagram ↗
                                                    </a>
                                                )}
                                                {article.publishedUrlTwitter && (
                                                    <a href={article.publishedUrlTwitter} target="_blank" rel="noopener" className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface border border-border hover:border-blue-400/40 hover:bg-blue-400/5 transition-all text-[11px] font-bold">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z"></path></svg>
                                                        X (Twitter) ↗
                                                    </a>
                                                )}
                                            </div>
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
                                    <button
                                        onClick={() => deleteArticle(article.id)}
                                        className="px-4 py-1.5 rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors text-sm font-medium ml-auto"
                                    >
                                        Delete
                                    </button>
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
