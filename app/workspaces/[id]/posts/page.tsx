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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-3">
                                <div>
                                    <p className="text-xs text-muted mb-1 font-mono">ORIGINAL</p>
                                    <p className="text-sm text-foreground/80">{post.contentOriginal || "—"}</p>
                                </div>
                                <div>
                                    <p className="text-xs text-muted mb-1 font-mono">TRANSLATED</p>
                                    <p className="text-sm text-foreground">
                                        {post.contentTranslated || (
                                            <span className="text-muted italic">Not yet translated</span>
                                        )}
                                    </p>
                                </div>
                            </div>

                            {/* Engagement */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-4 text-xs text-muted">
                                    <span>❤️ {post.likes}</span>
                                    <span>💬 {post.replies}</span>
                                    <span>🔄 {post.reposts}</span>
                                    {post.sourceUrl && (
                                        <a
                                            href={post.sourceUrl}
                                            target="_blank"
                                            rel="noopener"
                                            className="text-accent hover:text-accent-hover"
                                        >
                                            View Original ↗
                                        </a>
                                    )}
                                    {post.publishedUrl && (
                                        <a
                                            href={post.publishedUrl}
                                            target="_blank"
                                            rel="noopener"
                                            className="text-success"
                                        >
                                            Published ↗
                                        </a>
                                    )}
                                </div>

                                {/* Actions */}
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
