import Link from "next/link";
import { prisma } from "@/lib/prisma";
import AutoRefresh from "@/components/AutoRefresh";
import { auth } from "@/auth";

export const dynamic = "force-dynamic";

export default async function HomePage() {
    const session = await auth();
    const userId = session?.user?.id;

    // Fetch workspaces owned by user (or unowned)
    const workspaces = await (prisma as any).workspace.findMany({
        where: {
            OR: [
                { ownerId: userId },
                { ownerId: null }
            ]
        },
        orderBy: { createdAt: "desc" },
        include: {
            _count: { select: { articles: true } },
        },
    });

    // Scope to user's workspaces for article stats
    const workspaceFilter = {
        workspace: {
            OR: [
                { ownerId: userId },
                { ownerId: null }
            ]
        }
    } as any;

    // Global stats (Articles based) - Filtered by ownership
    const totalArticles = await (prisma as any).synthesizedArticle.count({
        where: workspaceFilter
    });
    const pendingArticles = await (prisma as any).synthesizedArticle.count({
        where: { ...workspaceFilter, status: "PENDING_REVIEW" }
    });
    const publishedArticles = await (prisma as any).synthesizedArticle.count({
        where: { ...workspaceFilter, status: "PUBLISHED" }
    });

    // Engagement stats - Filtered by ownership
    const engagement = await (prisma as any).synthesizedArticle.aggregate({
        where: workspaceFilter,
        _sum: {
            views: true,
            likes: true
        }
    });

    return (
        <div className="space-y-8">
            <AutoRefresh />
            {/* Header */}
            <div className="flex items-end justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Workspaces Dashboard</h1>
                    <p className="text-muted mt-1">Monitor your topics and automated publishing</p>
                </div>
                <Link
                    href="/workspaces/new"
                    className="px-4 py-2 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors"
                >
                    + New Workspace
                </Link>
            </div>

            {/* Global Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <StatCard label="Review Queue" value={pendingArticles} accent />
                <StatCard label="Published" value={publishedArticles} success />
                <StatCard label="Total Articles" value={totalArticles} />
                <StatCard label="Total Views" value={engagement._sum?.views || 0} info />
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
                    {workspaces.map((ws: any, i: number) => (
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
                                <span className="flex items-center gap-1">
                                    📄 {ws._count?.articles || 0} articles
                                </span>
                                <span>·</span>
                                <span>Limit: {ws.dailyPostLimit}/day</span>
                            </div>

                            {/* Account tags */}
                            {ws.targetAccounts.length > 0 && (
                                <div className="flex flex-wrap gap-1.5 mt-3">
                                    {ws.targetAccounts.slice(0, 3).map((acc: string) => (
                                        <span
                                            key={acc}
                                            className="text-[10px] px-2 py-0.5 rounded-full bg-surface border border-border text-muted"
                                        >
                                            @{acc}
                                        </span>
                                    ))}
                                    {ws.targetAccounts.length > 3 && (
                                        <span className="text-[10px] px-2 py-0.5 text-muted">
                                            +{ws.targetAccounts.length - 3} more
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
    info,
}: {
    label: string;
    value: number;
    accent?: boolean;
    success?: boolean;
    info?: boolean;
}) {
    return (
        <div className="border border-border rounded-xl p-4 bg-surface">
            <p className="text-sm text-muted">{label}</p>
            <p
                className={`text-2xl font-bold mt-1 ${accent ? "text-warning" :
                        success ? "text-success" :
                            info ? "text-accent" :
                                "text-foreground"
                    }`}
            >
                {value.toLocaleString()}
            </p>
        </div>
    );
}
