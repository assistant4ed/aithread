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

            <form onSubmit={handleSubmit} className="space-y-6 bg-surface border border-border rounded-xl p-8 shadow-sm">
                <div className="space-y-3">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
                        Headline (Topic Name)
                    </label>
                    <input
                        type="text"
                        value={form.topicName}
                        onChange={(e) => setForm({ ...form, topicName: e.target.value })}
                        className="input font-bold text-xl py-4"
                        placeholder="Enter article headline..."
                        required
                    />
                </div>

                <div className="space-y-3">
                    <label className="text-xs font-bold text-muted uppercase tracking-wider flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-accent"></div>
                        Article Content
                    </label>
                    <textarea
                        value={form.articleContent}
                        onChange={(e) => setForm({ ...form, articleContent: e.target.value })}
                        rows={18}
                        className="input text-base leading-relaxed whitespace-pre-wrap font-sans min-h-[400px]"
                        placeholder="Write article content here..."
                        required
                    />
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-6 border-t border-border mt-8">
                    <button
                        type="submit"
                        disabled={saving}
                        className="btn-primary px-10 py-3 text-base flex-1"
                    >
                        {saving ? (
                            <>
                                <svg className="animate-spin h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                Saving Changes...
                            </>
                        ) : "Save Article Draft"}
                    </button>
                    <Link
                        href={`/workspaces/${workspaceId}/articles`}
                        className="px-8 py-3 border border-border text-muted hover:text-foreground hover:bg-surface-hover text-sm font-semibold rounded-xl transition-all inline-block text-center flex-1 sm:flex-none"
                    >
                        Cancel
                    </Link>
                </div>
            </form>
        </div>
    );
}
