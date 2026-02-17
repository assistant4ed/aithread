import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WorkspaceActions from "./actions";
import AutoRefresh from "@/components/AutoRefresh";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WorkspaceDetailPage({ params }: PageProps) {
    const { id } = await params;

    const workspace = await prisma.workspace.findUnique({
        where: { id },
        include: {
            _count: {
                select: { posts: true },
            },
        },
    });

    if (!workspace) notFound();

    // Post stats
    const [pendingCount, approvedCount, publishedCount, errorCount] = await Promise.all([
        prisma.post.count({ where: { workspaceId: id, status: "PENDING_REVIEW" } }),
        prisma.post.count({ where: { workspaceId: id, status: "APPROVED" } }),
        prisma.post.count({ where: { workspaceId: id, status: "PUBLISHED" } }),
        prisma.post.count({ where: { workspaceId: id, status: "ERROR" } }),
    ]);

    // Recent posts
    const recentPosts = await prisma.post.findMany({
        where: { workspaceId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
    });

    return (
        <div className="space-y-8 animate-fade-in">
            <AutoRefresh />
            {/* Header */}
            <div className="flex items-start justify-between">
                <div>
                    <Link href="/" className="text-sm text-muted hover:text-foreground transition-colors">
                        ← Back to Workspaces
                    </Link>
                    <div className="flex items-center gap-3 mt-2">
                        <h1 className="text-3xl font-bold tracking-tight">{workspace.name}</h1>
                        <span
                            className={`text-xs px-2 py-0.5 rounded-full font-mono ${workspace.isActive
                                ? "bg-success/10 text-success border border-success/30"
                                : "bg-muted/10 text-muted border border-border"
                                }`}
                        >
                            {workspace.isActive ? "ACTIVE" : "PAUSED"}
                        </span>
                    </div>
                </div>
                <WorkspaceActions workspace={workspace} />
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MiniStat label="Pending" value={pendingCount} color="text-warning" />
                <MiniStat label="Approved" value={approvedCount} color="text-accent" />
                <MiniStat label="Published" value={publishedCount} color="text-success" />
                <MiniStat label="Errors" value={errorCount} color="text-danger" />
            </div>

            {/* Configuration */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Target Accounts */}
                <section className="border border-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                        Target Accounts ({workspace.targetAccounts.length})
                    </h2>
                    {workspace.targetAccounts.length === 0 ? (
                        <p className="text-sm text-muted">No accounts configured</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {workspace.targetAccounts.map((acc) => (
                                <span
                                    key={acc}
                                    className="text-sm px-3 py-1 rounded-full bg-surface border border-border text-foreground"
                                >
                                    @{acc}
                                </span>
                            ))}
                        </div>
                    )}
                </section>

                {/* Settings */}
                <section className="border border-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Settings</h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <dt className="text-muted">Topic Filter</dt>
                            <dd className="font-mono text-right max-w-[200px] truncate">
                                {workspace.topicFilter ? (
                                    <span className="text-accent" title={workspace.topicFilter}>{workspace.topicFilter}</span>
                                ) : (
                                    <span className="text-muted/50 italic">None</span>
                                )}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Hot Score Threshold</dt>
                            <dd className="font-mono">{workspace.hotScoreThreshold}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Max Post Age</dt>
                            <dd className="font-mono">{workspace.maxPostAgeHours}h</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Daily Post Limit</dt>
                            <dd className="font-mono">{workspace.dailyPostLimit}</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Threads Credentials</dt>
                            <dd className="font-mono">
                                {workspace.threadsToken ? (
                                    <span className="text-success">✓ Configured</span>
                                ) : (
                                    <span className="text-muted">Not set</span>
                                )}
                            </dd>
                        </div>
                    </dl>
                </section>
            </div>

            {/* Translation Prompt */}
            <section className="border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                    Translation Prompt
                </h2>
                <pre className="text-xs text-muted font-mono whitespace-pre-wrap bg-surface rounded-lg p-4 max-h-40 overflow-y-auto">
                    {workspace.translationPrompt}
                </pre>
            </section>

            {/* Recent Posts */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Recent Posts</h2>
                    <Link
                        href={`/workspaces/${workspace.id}/posts`}
                        className="text-sm text-accent hover:text-accent-hover transition-colors"
                    >
                        View All →
                    </Link>
                </div>

                {recentPosts.length === 0 ? (
                    <div className="border border-dashed border-border rounded-xl p-8 text-center">
                        <p className="text-muted">No posts yet. The worker will start scraping when active.</p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {recentPosts.map((post) => (
                            <div
                                key={post.id}
                                className="border border-border rounded-lg p-4 hover:bg-surface-hover transition-colors"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-mono text-muted">@{post.sourceAccount}</span>
                                        <StatusBadge status={post.status} />
                                    </div>
                                    <span className="text-xs text-muted font-mono">
                                        Score: {post.hotScore.toFixed(0)}
                                    </span>
                                </div>
                                <p className="text-sm text-foreground line-clamp-2">
                                    {post.contentTranslated || post.contentOriginal || "No content"}
                                </p>
                                <div className="flex items-center gap-4 mt-2 text-xs text-muted">
                                    <span>❤️ {post.likes}</span>
                                    <span>💬 {post.replies}</span>
                                    <span>🔄 {post.reposts}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
    return (
        <div className="border border-border rounded-lg p-3 bg-surface">
            <p className="text-xs text-muted">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value}</p>
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
