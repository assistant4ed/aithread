"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface ScrapeButtonProps {
    workspaceId: string;
    isScraping?: boolean;
}

export default function ScrapeButton({ workspaceId, isScraping: initialIsScraping }: ScrapeButtonProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [cooldown, setCooldown] = useState(0);
    const [isScraping, setIsScraping] = useState(initialIsScraping || false);

    const COOLDOWN_KEY = `scrape_cooldown_${workspaceId}`;
    const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

    useEffect(() => {
        setIsScraping(initialIsScraping || false);
    }, [initialIsScraping]);

    useEffect(() => {
        const lastRun = localStorage.getItem(COOLDOWN_KEY);
        if (lastRun) {
            const remaining = Math.max(0, COOLDOWN_MS - (Date.now() - parseInt(lastRun)));
            if (remaining > 0) {
                setCooldown(Math.ceil(remaining / 1000));
                const timer = setInterval(() => {
                    setCooldown((prev) => {
                        if (prev <= 1) {
                            clearInterval(timer);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
                return () => clearInterval(timer);
            }
        }
    }, [workspaceId, COOLDOWN_KEY, COOLDOWN_MS]);

    const handleRun = async () => {
        if (cooldown > 0 || loading || isScraping) return;

        setLoading(true);
        try {
            const res = await fetch(`/api/workspaces/${workspaceId}/trigger`, {
                method: "POST",
            });

            if (res.ok) {
                localStorage.setItem(COOLDOWN_KEY, Date.now().toString());
                setCooldown(COOLDOWN_MS / 1000);
                setIsScraping(true);
                router.refresh();

                // Set another timer for the newly started cooldown
                const timer = setInterval(() => {
                    setCooldown((prev) => {
                        if (prev <= 1) {
                            clearInterval(timer);
                            return 0;
                        }
                        return prev - 1;
                    });
                }, 1000);
            } else {
                const data = await res.json();
                alert(data.message || data.error || "Failed to trigger scraper");
                if (res.status === 409) {
                    setIsScraping(true);
                    router.refresh();
                }
            }
        } catch (error) {
            console.error("Error triggering scrape:", error);
            alert("Failed to trigger scraper. Check console for details.");
        } finally {
            setLoading(false);
        }
    };

    const formatCooldown = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    if (isScraping) {
        return (
            <button
                disabled
                className="px-3 py-1.5 text-sm rounded-lg border border-accent/30 bg-accent/5 text-accent animate-pulse cursor-not-allowed"
            >
                Scraping in Progress...
            </button>
        );
    }

    return (
        <button
            onClick={handleRun}
            disabled={loading || cooldown > 0}
            className={`px-3 py-1.5 text-sm rounded-lg border transition-all ${loading || cooldown > 0
                    ? "border-border text-muted bg-surface cursor-not-allowed"
                    : "border-accent/50 text-accent hover:bg-accent/10 active:scale-95"
                }`}
        >
            {loading ? (
                <span className="flex items-center gap-2">
                    <span className="w-3 h-3 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Requesting...
                </span>
            ) : cooldown > 0 ? (
                `Cooldown (${formatCooldown(cooldown)})`
            ) : (
                "Run Scraper"
            )}
        </button>
    );
}
