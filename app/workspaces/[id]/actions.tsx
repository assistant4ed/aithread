"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import ScrapeButton from "./_components/ScrapeButton";

interface WorkspaceActionsProps {
    workspace: {
        id: string;
        isActive: boolean;
    };
    isScraping?: boolean;
}

export default function WorkspaceActions({ workspace, isScraping }: WorkspaceActionsProps) {
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

    const deleteWorkspace = async () => {
        const confirmText = window.prompt("To delete this workspace Permanently, please type 'DELETE':");
        if (confirmText !== "DELETE") {
            if (confirmText !== null) alert("Incorrect text. Workspace was not deleted.");
            return;
        }

        setLoading(true);
        try {
            const res = await fetch(`/api/workspaces/${workspace.id}`, {
                method: "DELETE",
            });
            if (res.ok) {
                router.push("/");
            } else {
                const data = await res.json();
                alert(data.error || "Failed to delete workspace");
            }
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex gap-2">
            <ScrapeButton workspaceId={workspace.id} isScraping={isScraping} />
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
            <button
                onClick={deleteWorkspace}
                disabled={loading}
                className="px-3 py-1.5 text-sm rounded-lg border border-danger/50 text-danger hover:bg-danger/10 transition-colors"
            >
                {loading ? "..." : "Delete"}
            </button>
        </div>
    );
}
