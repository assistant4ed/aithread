"use client";

interface DailyProgressCardProps {
    publishedCount: number;
    dailyLimit: number;
    nextPublishTime?: string;
}

export default function DailyProgressCard({ publishedCount, dailyLimit, nextPublishTime }: DailyProgressCardProps) {
    const percentage = Math.min(100, (publishedCount / dailyLimit) * 100);
    const remaining = Math.max(0, dailyLimit - publishedCount);
    const isLimitReached = publishedCount >= dailyLimit;

    return (
        <div className={`border rounded-xl p-5 transition-all ${
            isLimitReached
                ? "border-warning/50 bg-warning/5"
                : "border-border bg-surface/50"
        }`}>
            <div className="flex items-center justify-between mb-4">
                <div>
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Daily Publishing Progress
                    </h3>
                    <p className="text-xs text-muted mt-1">
                        {isLimitReached ? (
                            <span className="text-warning">⚠️ Daily limit reached</span>
                        ) : (
                            <span>{remaining} article{remaining !== 1 ? 's' : ''} remaining today</span>
                        )}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-3xl font-bold">
                        <span className="text-success">{publishedCount}</span>
                        <span className="text-muted text-xl">/{dailyLimit}</span>
                    </div>
                    <p className="text-xs text-muted mt-1">
                        {percentage.toFixed(0)}% complete
                    </p>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="relative h-3 bg-muted/20 rounded-full overflow-hidden mb-3">
                <div
                    className={`h-full rounded-full transition-all duration-500 ${
                        isLimitReached ? "bg-warning" : "bg-success"
                    }`}
                    style={{ width: `${percentage}%` }}
                />
                {!isLimitReached && percentage > 0 && (
                    <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-success/0 to-success/30 rounded-full animate-pulse"
                        style={{ width: `${percentage}%` }}
                    />
                )}
            </div>

            {/* Next Publish Time */}
            {nextPublishTime && !isLimitReached && (
                <div className="flex items-center gap-2 text-xs text-muted">
                    <span className="text-accent">⏰</span>
                    <span>Next publish window: <span className="font-mono text-foreground">{nextPublishTime}</span></span>
                </div>
            )}
        </div>
    );
}
