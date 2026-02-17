import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HomePage() {
    const workspaces = await prisma.workspace.findMany({
        orderBy: { createdAt: "desc" },
        include: {
            _count: { select: { posts: true } },
        },
    });

    // Global stats
    const totalPosts = await prisma.post.count();
    const pendingPosts = await prisma.post.count({ where: { status: "PENDING_REVIEW" } });
    const publishedPosts = await prisma.post.count({ where: { status: "PUBLISHED" } });

    return (
        <div className="space-y-8">
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Workspaces</h1>
                    <p className="text-muted mt-1">Manage your content monitoring pipelines</p>
                </div>
                <Link
                    href="/workspaces/new"
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                >
                    + New Workspace
                </Link>
            </div>

            {/* Global Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <StatCard label="Total Posts" value={totalPosts} />
                <StatCard label="Pending Review" value={pendingPosts} accent />
                <StatCard label="Published" value={publishedPosts} success />
            </div>

            {/* Workspace Grid */}
            {workspaces.length === 0 ? (
                <div className="border border-dashed border-border rounded-xl p-12 text-center">
                    <p className="text-muted text-lg">No workspaces yet</p>
                    <p className="text-muted text-sm mt-1">
                        Create your first workspace to start monitoring Threads accounts.
                    </p>
                    <Link
                        href="/workspaces/new"
                        className="inline-block mt-4 px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm rounded-lg transition-colors"
                    >
                        Create Workspace
                    </Link>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {workspaces.map((ws, i) => (
                        <Link
                            key={ws.id}
                            href={`/workspaces/${ws.id}`}
                            className="group relative border border-border rounded-xl p-5 hover:border-accent/50 hover:bg-surface-hover transition-all duration-200 animate-fade-in"
                            style={{ animationDelay: `${i * 50}ms` }}
                        >
                            {/* Active indicator */}
                            <div className="flex items-center justify-between mb-3">
                                <div className="flex items-center gap-2">
                                    <span
                                        className={`w-2 h-2 rounded-full ${ws.isActive ? "bg-success animate-pulse-dot" : "bg-muted"}`}
                                    />
                                    <span className="text-xs text-muted font-mono">
                                        {ws.isActive ? "ACTIVE" : "PAUSED"}
                                    </span>
                                </div>
                                <span className="text-xs text-muted">
                                    {ws.targetAccounts.length} accounts
                                </span>
                            </div>

                            <h3 className="text-lg font-semibold group-hover:text-accent-hover transition-colors">
                                {ws.name}
                            </h3>

                            <div className="flex items-center gap-3 mt-3 text-sm text-muted">
                                <span>{ws._count.posts} posts</span>
                                <span>·</span>
                                <span>Limit: {ws.dailyPostLimit}/day</span>
                            </div>

                            {/* Account tags */}
                            {ws.targetAccounts.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {ws.targetAccounts.slice(0, 5).map((acc) => (
                                        <span
                                            key={acc}
                                            className="text-xs px-2 py-0.5 rounded-full bg-surface border border-border text-muted"
                                        >
                                            @{acc}
                                        </span>
                                    ))}
                                    {ws.targetAccounts.length > 5 && (
                                        <span className="text-xs px-2 py-0.5 text-muted">
                                            +{ws.targetAccounts.length - 5} more
                                        </span>
                                    )}
                                </div>
                            )}
                        </Link>
                    ))}
                </div>
            )}
        </div>
    );
}

function StatCard({
    label,
    value,
    accent,
    success,
}: {
    label: string;
    value: number;
    accent?: boolean;
    success?: boolean;
}) {
    return (
        <div className="border border-border rounded-xl p-4 bg-surface">
            <p className="text-sm text-muted">{label}</p>
            <p
                className={`text-2xl font-bold mt-1 ${accent ? "text-accent" : success ? "text-success" : "text-foreground"}`}
            >
                {value.toLocaleString()}
            </p>
        </div>
    );
}
