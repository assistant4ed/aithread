import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import WorkspaceActions from "./actions";
import AutoRefresh from "@/components/AutoRefresh";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

interface PageProps {
    params: Promise<{ id: string }>;
}

export default async function WorkspaceDetailPage({ params }: PageProps) {
    const { id } = await params;
    const session = await auth();
    const userId = session?.user?.id;

    const workspace = await (prisma as any).workspace.findUnique({
        where: {
            id,
            OR: [
                { ownerId: userId },
                { ownerId: null }
            ]
        } as any,
        include: {
            _count: {
                select: { articles: true },
            },
            sources: true,
        },
    });

    if (!workspace) notFound();

    // Article stats (replacing Post stats)
    const [pendingCount, approvedCount, publishedCount, errorCount] = await Promise.all([
        (prisma as any).synthesizedArticle.count({ where: { workspaceId: id, status: "PENDING_REVIEW" } }),
        (prisma as any).synthesizedArticle.count({ where: { workspaceId: id, status: "APPROVED" } }),
        (prisma as any).synthesizedArticle.count({ where: { workspaceId: id, status: "PUBLISHED" } }),
        (prisma as any).synthesizedArticle.count({ where: { workspaceId: id, status: "ERROR" } }),
    ]);

    // Recent articles
    const recentArticles = await (prisma as any).synthesizedArticle.findMany({
        where: { workspaceId: id },
        orderBy: { createdAt: "desc" },
        take: 10,
    });

    // Latest pipeline runs
    const pipelineRuns = await (prisma as any).pipelineRun.findMany({
        where: { workspaceId: id },
        orderBy: { startedAt: "desc" },
        take: 15, // Take enough to find the latest of each step
    });

    const latestRuns = {
        SCRAPE: pipelineRuns.find((r: any) => r.step === "SCRAPE"),
        SYNTHESIS: pipelineRuns.find((r: any) => r.step === "SYNTHESIS"),
        PUBLISH: pipelineRuns.find((r: any) => r.step === "PUBLISH"),
    };

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

            {/* Pipeline Status */}
            <section className="bg-surface/50 border border-border rounded-xl p-5">
                <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-4">Pipeline Status</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <PipelineStepDisplay
                        label="Scraping"
                        run={latestRuns.SCRAPE}
                    />
                    <PipelineStepDisplay
                        label="Synthesis"
                        run={latestRuns.SYNTHESIS}
                    />
                    <PipelineStepDisplay
                        label="Publishing"
                        run={latestRuns.PUBLISH}
                    />
                </div>
            </section>

            {/* Configuration */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Scraper Sources */}
                <section className="border border-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">
                        Scraper Sources ({workspace.sources.length})
                    </h2>
                    {workspace.sources.length === 0 ? (
                        <p className="text-sm text-muted">No sources configured</p>
                    ) : (
                        <div className="flex flex-wrap gap-2">
                            {workspace.sources.map((source: any) => (
                                <div
                                    key={source.id}
                                    className={`flex items-center gap-2 px-3 py-1 rounded-full bg-surface border text-sm font-medium transition-all ${source.isActive
                                        ? "border-accent/40 text-foreground"
                                        : "border-border text-muted opacity-50"
                                        }`}
                                >
                                    <span className={`text-[10px] font-bold p-0.5 rounded ${source.type === 'TOPIC' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                                        }`}>
                                        {source.type}
                                    </span>
                                    {source.type === 'ACCOUNT' ? (
                                        <a
                                            href={`https://www.threads.net/${source.value.replace(/^@/, '')}`}
                                            target="_blank"
                                            rel="noopener"
                                            className="hover:text-accent hover:underline"
                                        >
                                            {source.value}
                                        </a>
                                    ) : (
                                        <span>{source.value}</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Settings */}
                <section className="border border-border rounded-xl p-5">
                    <h2 className="text-sm font-semibold text-muted uppercase tracking-wider mb-3">Settings</h2>
                    <dl className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <dd className="font-mono text-right max-w-[200px] truncate">
                                {workspace.topicFilter ? (
                                    <span className="text-accent" title={workspace.topicFilter}>{workspace.topicFilter}</span>
                                ) : (
                                    <span className="text-muted/50 italic">None</span>
                                )}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Synthesis Language</dt>
                            <dd className="font-mono text-right">{workspace.synthesisLanguage}</dd>
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
                            <dt className="text-muted">Publish Schedule</dt>
                            <dd className="font-mono text-right">
                                {workspace.publishTimes && workspace.publishTimes.length > 0
                                    ? workspace.publishTimes.join(", ")
                                    : "Default"}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Review Window</dt>
                            <dd className="font-mono">{workspace.reviewWindowHours}h before publish</dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Threads Connection</dt>
                            <dd className="font-mono">
                                {workspace.threadsToken ? (
                                    <span className="text-success">✓ Connected</span>
                                ) : (
                                    <span className="text-muted">Not set</span>
                                )}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">Instagram Connection</dt>
                            <dd className="font-mono">
                                {workspace.instagramAccessToken ? (
                                    <span className="text-success">✓ Connected</span>
                                ) : (
                                    <span className="text-muted">Not set</span>
                                )}
                            </dd>
                        </div>
                        <div className="flex justify-between">
                            <dt className="text-muted">X (Twitter) Connection</dt>
                            <dd className="font-mono">
                                {workspace.twitterAccessToken ? ( // This is use for OAuth 2.0 user tokens
                                    <span className="text-success">✓ Connected</span>
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

            {/* Recent Articles */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Recent Synthesized Articles</h2>
                    <Link
                        href={`/workspaces/${workspace.id}/articles`}
                        className="text-sm text-accent hover:text-accent-hover transition-colors"
                    >
                        View All →
                    </Link>
                </div>

                {recentArticles.length === 0 ? (
                    <div className="border border-dashed border-border rounded-xl p-8 text-center">
                        <p className="text-muted">No articles synthesized yet. The engine runs every 30 minutes.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {recentArticles.map((article: any) => (
                            <div
                                key={article.id}
                                className="border border-border rounded-lg p-5 hover:bg-surface-hover transition-colors"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-semibold bg-surface border border-border px-2 py-0.5 rounded text-foreground">
                                            {article.topicName}
                                        </span>
                                        <StatusBadge status={article.status} />
                                    </div>
                                    <span className="text-xs text-muted font-mono">
                                        {new Date(article.createdAt).toLocaleDateString()}
                                    </span>
                                </div>
                                <p className="text-sm text-foreground line-clamp-3 mb-3 whitespace-pre-wrap">
                                    {article.articleContent}
                                </p>
                                <div className="flex flex-wrap items-center gap-4 text-xs text-muted">
                                    <span className="flex items-center gap-1" title="Sources">👥 {article.authorCount}</span>
                                    <span className="flex items-center gap-1" title="Posts">📄 {article.postCount}</span>
                                    <span className="flex items-center gap-1" title="Views">👁️ {((article as any).views || 0).toLocaleString()}</span>
                                    <span className="flex items-center gap-1" title="Likes">❤️ {((article as any).likes || 0).toLocaleString()}</span>
                                    <span className="flex items-center gap-1" title="Replies">💬 {((article as any).replies || 0).toLocaleString()}</span>
                                    <span className="flex items-center gap-1" title="Reposts">🔄 {((article as any).reposts || 0).toLocaleString()}</span>
                                    {(article as any).publishedUrl && (
                                        <a
                                            href={article.publishedUrl}
                                            target="_blank"
                                            rel="noopener"
                                            className="text-success hover:underline"
                                        >
                                            View Published ↗
                                        </a>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
}

function PipelineStepDisplay({ label, run }: { label: string; run: any }) {
    if (!run) {
        return (
            <div className="flex flex-col gap-1">
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-muted" />
                    <span className="text-sm font-medium">{label}</span>
                </div>
                <span className="text-xs text-muted ml-4">No runs recorded</span>
            </div>
        );
    }

    const statusColors: Record<string, string> = {
        RUNNING: "bg-warning animate-pulse",
        COMPLETED: "bg-success",
        FAILED: "bg-danger",
    };

    const duration = run.completedAt
        ? Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)
        : null;

    const metadata = run.metadata ? (typeof run.metadata === 'string' ? JSON.parse(run.metadata) : run.metadata) : null;

    const renderDetails = () => {
        if (!metadata) return null;

        if (run.step === 'SCRAPE') {
            return (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5">
                    <span className="text-[10px] text-muted">🎯 {metadata.sourcesTotal || 0} Sources</span>
                    <span className="text-[10px] text-muted">📦 {metadata.jobsEnqueued || 0} Jobs</span>
                    {metadata.recentPostsCaptured > 0 && (
                        <span className="text-[10px] text-success">✨ {metadata.recentPostsCaptured} New Posts</span>
                    )}
                    {metadata.limitReached && (
                        <span className="text-[10px] text-warning">⚠️ Limit Reached</span>
                    )}
                </div>
            );
        }

        if (run.step === 'SYNTHESIS') {
            return (
                <div className="flex flex-col gap-0.5 mt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2">
                        <span className="text-[10px] text-muted">🔍 {metadata.postsInWindow || 0} Posts viewed</span>
                        <span className="text-[10px] text-muted">🧩 {metadata.clustersFound || 0} Clusters</span>
                        <span className="text-[10px] text-success font-medium">📰 {metadata.articlesGenerated || 0} Articles</span>
                    </div>
                    {metadata.reason && metadata.articlesGenerated === 0 && (
                        <span className="text-[10px] text-muted italic line-clamp-1">ℹ️ {metadata.reason}</span>
                    )}
                </div>
            );
        }

        if (run.step === 'PUBLISH') {
            return (
                <div className="flex flex-col gap-0.5 mt-0.5">
                    <div className="flex flex-wrap items-center gap-x-2">
                        <span className="text-[10px] text-muted">📅 {metadata.publishedToday || 0}/{metadata.dailyLimit || 0} Today</span>
                        <span className="text-[10px] text-muted">📫 {metadata.approvedReady || 0} Ready</span>
                        <span className="text-[10px] text-success font-medium">✅ {metadata.published || 0} Sent</span>
                        {metadata.failed > 0 && <span className="text-[10px] text-danger">❌ {metadata.failed} Failed</span>}
                    </div>
                    {metadata.reason && metadata.published === 0 && (
                        <span className="text-[10px] text-muted italic line-clamp-1">ℹ️ {metadata.reason}</span>
                    )}
                </div>
            );
        }

        return null;
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${statusColors[run.status] || "bg-muted"}`} />
                    <span className="text-sm font-medium">{label}</span>
                </div>
                <span className="text-[10px] font-mono text-muted">
                    {formatRelativeTime(new Date(run.startedAt))}
                </span>
            </div>
            <div className="ml-4 flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold ${run.status === 'FAILED' ? 'text-danger' : 'text-muted'}`}>
                        {run.status}
                    </span>
                    {duration !== null && (
                        <span className="text-[10px] text-muted/50">• {duration}s</span>
                    )}
                </div>
                {renderDetails()}
                {run.error && (
                    <p className="text-[10px] text-danger line-clamp-1 italic mt-0.5" title={run.error}>
                        {run.error}
                    </p>
                )}
            </div>
        </div>
    );
}

function formatRelativeTime(date: Date) {
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffInSeconds < 60) return `${diffInSeconds}s ago`;
    if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`;
    if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`;
    return date.toLocaleDateString();
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
