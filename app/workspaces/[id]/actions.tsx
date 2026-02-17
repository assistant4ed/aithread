"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface WorkspaceActionsProps {
    workspace: {
        id: string;
        isActive: boolean;
    };
}

export default function WorkspaceActions({ workspace }: WorkspaceActionsProps) {
    const router = useRouter();
    const [loading, setLoading] = useState(false);

    const toggleActive = async () => {
        setLoading(true);
        try {
            await fetch(`/api/workspaces/${workspace.id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive: !workspace.isActive }),
            });
            router.refresh();
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex gap-2">
            <button
                onClick={toggleActive}
                disabled={loading}
                className={`px-3 py-1.5 text-sm rounded-lg border transition-colors ${workspace.isActive
                        ? "border-warning/50 text-warning hover:bg-warning/10"
                        : "border-success/50 text-success hover:bg-success/10"
                    }`}
            >
                {loading ? "..." : workspace.isActive ? "Pause" : "Activate"}
            </button>
            <a
                href={`/workspaces/${workspace.id}/edit`}
                className="px-3 py-1.5 text-sm rounded-lg border border-border text-muted hover:text-foreground hover:bg-surface-hover transition-colors"
            >
                Edit
            </a>
        </div>
    );
}
