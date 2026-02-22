"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";

interface Post {
    id: string;
    threadId: string;
    sourceAccount: string;
    contentOriginal: string | null;
    contentTranslated: string | null;
    mediaUrls: any;
    likes: number;
    replies: number;
    reposts: number;
    hotScore: number;
    sourceUrl: string | null;
    status: string;
    publishedUrl: string | null;
    createdAt: string;
}

const STATUS_TABS = ["ALL", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "ERROR"] as const;

export default function PostsPage() {
    const params = useParams();
    const workspaceId = params.id as string;
    const [posts, setPosts] = useState<Post[]>([]);
    const [total, setTotal] = useState(0);
    const [activeTab, setActiveTab] = useState<string>("PENDING_REVIEW");
    const [sortBy, setSortBy] = useState("createdAt");
    const [loading, setLoading] = useState(true);
    const [editingPost, setEditingPost] = useState<Post | null>(null);

    const fetchPosts = useCallback(async () => {
        setLoading(true);
        const status = activeTab === "ALL" ? "" : activeTab;
        const qs = new URLSearchParams({
            workspaceId,
            ...(status && { status }),
            limit: "50",
            sortBy,
            sortOrder: "desc",
        });
        const res = await fetch(`/api/posts?${qs}`);
        const data = await res.json();
        setPosts(data.posts);
        setTotal(data.total);
        setLoading(false);
    }, [workspaceId, activeTab, sortBy]);

    useEffect(() => {
        fetchPosts();

        // Polling: refresh posts every 60 seconds
        const interval = setInterval(() => {
            fetchPosts();
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchPosts]);

    const updateStatus = async (postId: string, newStatus: string) => {
        await fetch(`/api/posts/${postId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: newStatus }),
        });
        fetchPosts();
    };

    const deletePost = async (postId: string) => {
        if (!confirm("Are you sure you want to delete this post? This cannot be undone.")) return;

        await fetch(`/api/posts/${postId}`, {
            method: "DELETE",
        });
        fetchPosts();
    };

    const saveEdit = async () => {
        if (!editingPost) return;
        await fetch(`/api/posts/${editingPost.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contentOriginal: editingPost.contentOriginal,
                contentTranslated: editingPost.contentTranslated,
            }),
        });
        setEditingPost(null);
        fetchPosts();
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
                    <h1 className="text-2xl font-bold tracking-tight mt-1">Post Review Queue</h1>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value)}
                        className="text-xs font-mono bg-surface border border-border rounded-md px-2 py-1 text-muted outline-none focus:border-accent"
                    >
                        <option value="createdAt">Newest</option>
                        <option value="hotScore">Highest Score</option>
                        <option value="likes">Most Likes</option>
                    </select>
                    <span className="text-sm text-muted">{total} posts</span>
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

            {/* Posts */}
            {loading ? (
                <div className="text-center py-12 text-muted">Loading...</div>
            ) : posts.length === 0 ? (
                <div className="border border-dashed border-border rounded-xl p-12 text-center">
                    <p className="text-muted">No posts with status &quot;{activeTab}&quot;</p>
                </div>
            ) : (
                <div className="space-y-3">
                    {posts.map((post) => (
                        <div
                            key={post.id}
                            className="border border-border rounded-xl p-5 hover:border-accent/30 transition-colors"
                        >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold">@{post.sourceAccount}</span>
                                    <StatusBadge status={post.status} />
                                    <span className="text-xs text-muted font-mono">
                                        🔥 {post.hotScore.toFixed(0)}
                                    </span>
                                </div>
                                <span className="text-xs text-muted">
                                    {new Date(post.createdAt).toLocaleDateString()}
                                </span>
                            </div>

                            {/* Content */}
                            <div className="space-y-4 mb-6">
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-muted uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-1 rounded-full bg-muted"></div>
                                            Original Content
                                        </label>
                                        <span className="text-[10px] text-muted-foreground font-mono">#{post.threadId.slice(-6)}</span>
                                    </div>
                                    <div className="text-sm text-foreground/80 bg-surface/30 border border-border/50 rounded-lg p-3 italic line-clamp-3">
                                        {post.contentOriginal}
                                    </div>
                                </div>

                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[10px] font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2">
                                            <div className="w-1 h-1 rounded-full bg-blue-500"></div>
                                            Refined / Translated
                                        </label>
                                    </div>
                                    <div className="text-sm text-foreground leading-relaxed bg-background border border-border rounded-xl p-4 shadow-inner min-h-[80px]">
                                        {post.contentTranslated || "No translation generated yet."}
                                    </div>
                                </div>
                            </div>

                            {/* Metrics & Actions Footer */}
                            <div className="flex items-center justify-between pt-4 border-t border-border/50">
                                <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                    <div className="flex items-center gap-1.5 bg-surface/50 px-2 py-0.5 rounded border border-border/50" title="Hot Score">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-orange-500"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.256 1.182-3.153"></path></svg>
                                        <span className="font-bold text-foreground">{post.hotScore.toFixed(0)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5" title="Engagement">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"></path></svg>
                                        <span>{post.likes + post.replies + post.reposts}</span>
                                    </div>
                                </div>
                                <div className="flex gap-2">
                                    {post.status === "PENDING_REVIEW" && (
                                        <>
                                            <button
                                                onClick={() => updateStatus(post.id, "APPROVED")}
                                                className="text-xs px-3 py-1 rounded-md bg-success/10 text-success border border-success/30 hover:bg-success/20 transition-colors"
                                            >
                                                ✓ Approve
                                            </button>
                                            <button
                                                onClick={() => updateStatus(post.id, "REJECTED")}
                                                className="text-xs px-3 py-1 rounded-md bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 transition-colors"
                                            >
                                                ✗ Reject
                                            </button>
                                            <button
                                                onClick={() => setEditingPost(post)}
                                                className="text-xs px-3 py-1 rounded-md bg-blue-500/10 text-blue-500 border border-blue-500/30 hover:bg-blue-500/20 transition-colors"
                                            >
                                                ✎ Edit
                                            </button>
                                        </>
                                    )}
                                    {post.status === "APPROVED" && (
                                        <span className="text-xs text-accent font-mono">
                                            Queued for publishing...
                                        </span>
                                    )}
                                    {post.status === "ERROR" && (
                                        <button
                                            onClick={() => updateStatus(post.id, "APPROVED")}
                                            className="text-xs px-3 py-1 rounded-md bg-warning/10 text-warning border border-warning/30 hover:bg-warning/20 transition-colors"
                                        >
                                            ↻ Retry
                                        </button>
                                    )}
                                    <button
                                        onClick={() => deletePost(post.id)}
                                        className="text-xs px-3 py-1 rounded-md bg-danger/10 text-danger border border-danger/30 hover:bg-danger/20 transition-colors ml-auto"
                                    >
                                        Delete
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Edit Modal */}
            {editingPost && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-surface border border-border rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col animate-in fade-in zoom-in duration-200">
                        <div className="p-5 border-b border-border flex items-center justify-between bg-surface/50">
                            <div className="flex items-center gap-3">
                                <div className="bg-blue-500/10 p-2 rounded-lg">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                </div>
                                <div>
                                    <h3 className="font-bold text-xl">Edit Post Content</h3>
                                    <p className="text-xs text-muted">Modify the original or translated version of this post.</p>
                                </div>
                            </div>
                            <button
                                onClick={() => setEditingPost(null)}
                                className="text-muted hover:text-foreground p-2 rounded-full hover:bg-surface-hover transition-all"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto space-y-6 bg-surface">
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-muted"></div>
                                        Original Content (Source)
                                    </label>
                                    <span className="text-[10px] text-muted font-mono">{editingPost.contentOriginal?.length || 0} chars</span>
                                </div>
                                <textarea
                                    value={editingPost.contentOriginal || ""}
                                    onChange={(e) => setEditingPost({ ...editingPost, contentOriginal: e.target.value })}
                                    placeholder="Enter original post content..."
                                    className="w-full h-40 bg-background border border-border rounded-xl p-4 text-sm focus:border-accent focus:ring-1 focus:ring-accent/20 outline-none font-mono transition-all resize-none"
                                />
                                <p className="text-[10px] text-muted italic">This is the raw content scraped from the source account.</p>
                            </div>

                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <label className="text-xs font-bold text-blue-500 uppercase tracking-wider flex items-center gap-2">
                                        <div className="w-1.5 h-1.5 rounded-full bg-blue-500"></div>
                                        Translated / Refined Content
                                    </label>
                                    <span className="text-[10px] text-muted font-mono">{editingPost.contentTranslated?.length || 0} chars</span>
                                </div>
                                <textarea
                                    value={editingPost.contentTranslated || ""}
                                    onChange={(e) => setEditingPost({ ...editingPost, contentTranslated: e.target.value })}
                                    placeholder="Enter translated or refined content..."
                                    className="w-full h-40 bg-background border border-border rounded-xl p-4 text-sm focus:border-accent focus:ring-1 focus:ring-accent/20 outline-none font-sans transition-all resize-none leading-relaxed"
                                />
                                <p className="text-[10px] text-muted italic">This version will be used for publishing if approved.</p>
                            </div>
                        </div>
                        <div className="p-5 border-t border-border flex justify-end gap-3 bg-surface/50 backdrop-blur-sm">
                            <button
                                onClick={() => setEditingPost(null)}
                                className="px-6 py-2.5 rounded-xl border border-border text-muted hover:text-foreground hover:bg-surface-hover transition-all text-sm font-semibold"
                            >
                                Discard Changes
                            </button>
                            <button
                                onClick={saveEdit}
                                className="px-8 py-2.5 rounded-xl bg-accent text-white hover:bg-accent-hover shadow-lg shadow-accent/20 transition-all text-sm font-bold flex items-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
                                Save Changes
                            </button>
                        </div>
                    </div>
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
