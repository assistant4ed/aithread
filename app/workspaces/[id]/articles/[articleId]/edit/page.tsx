"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";

export default function EditArticlePage() {
    const router = useRouter();
    const params = useParams();
    const workspaceId = params.id as string;
    const articleId = params.articleId as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        topicName: "",
        articleContent: "",
    });

    useEffect(() => {
        const fetchArticle = async () => {
            try {
                const res = await fetch(`/api/articles/${articleId}`);
                if (!res.ok) throw new Error("Failed to load article");
                const data = await res.json();

                setForm({
                    topicName: data.topicName,
                    articleContent: data.articleContent,
                });
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (articleId) {
            fetchArticle();
        }
    }, [articleId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");

        try {
            const res = await fetch(`/api/articles/${articleId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topicName: form.topicName,
                    articleContent: form.articleContent,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to update article");
            }

            router.push(`/workspaces/${workspaceId}/articles`);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-center py-12 text-muted font-mono">Loading Draft...</div>;

    return (
        <div className="max-w-3xl mx-auto animate-fade-in space-y-6">
            <div className="mb-6">
                <Link
                    href={`/workspaces/${workspaceId}/articles`}
                    className="text-sm text-muted hover:text-foreground transition-colors mb-2 block"
                >
                    ← Back to Review Queue
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">Edit Synthesized Draft</h1>
                <p className="text-sm text-muted mt-1">Refine the headline and content before approving for publication.</p>
            </div>

            {error && (
                <div className="p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                <div className="space-y-2">
                    <label className="text-sm font-semibold text-muted uppercase tracking-wider">Headline (Topic Name)</label>
                    <input
                        type="text"
                        value={form.topicName}
                        onChange={(e) => setForm({ ...form, topicName: e.target.value })}
                        className="w-full bg-surface border border-border rounded-lg p-3 text-foreground focus:border-accent outline-none transition-colors font-bold text-lg"
                        placeholder="Enter article headline..."
                        required
                    />
                </div>

                <div className="space-y-2">
                    <label className="text-sm font-semibold text-muted uppercase tracking-wider">Article Content</label>
                    <textarea
                        value={form.articleContent}
                        onChange={(e) => setForm({ ...form, articleContent: e.target.value })}
                        rows={15}
                        className="w-full bg-surface border border-border rounded-lg p-4 text-foreground focus:border-accent outline-none transition-colors text-sm leading-relaxed whitespace-pre-wrap font-sans"
                        placeholder="Write article content here..."
                        required
                    />
                </div>

                <div className="flex gap-3 pt-4 border-t border-border">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-8 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {saving ? "Saving Changes..." : "Save Draft"}
                    </button>
                    <Link
                        href={`/workspaces/${workspaceId}/articles`}
                        className="px-8 py-2.5 border border-border text-muted hover:text-foreground text-sm rounded-lg transition-colors inline-block text-center"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
