"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_PROMPT = `You are a professional translator. Translate the following Threads post to Traditional Chinese (Hong Kong style, Cantonese nuances if applicable).

RULES:
1. Output ONLY the translated text. Do NOT add "Here is the translation" or any conversational filler.
2. Do NOT translate the username, date code (e.g., 2d, 10/07/24), or engagement numbers (e.g., 604, 197) if they appear at the start or end.
3. Maintain the tone and brevity.`;

export default function NewWorkspacePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        name: "",
        targetAccounts: "",
        translationPrompt: DEFAULT_PROMPT,
        hotScoreThreshold: 50,
        threadsAppId: "",
        threadsToken: "",
        dailyPostLimit: 3,
        topicFilter: "",
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError("");

        try {
            const res = await fetch("/api/workspaces", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    ...form,
                    targetAccounts: form.targetAccounts
                        .split(",")
                        .map((a) => a.trim().replace(/^@/, ""))
                        .filter(Boolean),
                    hotScoreThreshold: Number(form.hotScoreThreshold),
                    dailyPostLimit: Number(form.dailyPostLimit),
                    topicFilter: form.topicFilter || null,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create workspace");
            }

            const workspace = await res.json();
            router.push(`/workspaces/${workspace.id}`);
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            <h1 className="text-2xl font-bold tracking-tight mb-6">Create Workspace</h1>

            {error && (
                <div className="mb-4 p-3 rounded-lg bg-danger/10 border border-danger/30 text-danger text-sm">
                    {error}
                </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Name */}
                <Field label="Workspace Name" required>
                    <input
                        type="text"
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="e.g. Tech News HK"
                        className="input"
                        required
                    />
                </Field>

                {/* Target Accounts */}
                <Field label="Target Accounts" hint="Comma-separated Threads usernames to scrape">
                    <input
                        type="text"
                        value={form.targetAccounts}
                        onChange={(e) => setForm({ ...form, targetAccounts: e.target.value })}
                        placeholder="@openai, @nvidia, @meta"
                        className="input"
                    />
                </Field>

                {/* Translation Prompt */}
                <Field label="Translation Prompt">
                    <textarea
                        value={form.translationPrompt}
                        onChange={(e) => setForm({ ...form, translationPrompt: e.target.value })}
                        rows={6}
                        className="input font-mono text-xs"
                    />
                </Field>

                {/* Topic Filter */}
                <Field label="Topic Filter (Optional)" hint="e.g. 'AI, Artificial Intelligence, LLMs'. If set, posts must be relevant to this topic.">
                    <input
                        type="text"
                        value={form.topicFilter}
                        onChange={(e) => setForm({ ...form, topicFilter: e.target.value })}
                        placeholder="Leave empty to process all posts"
                        className="input"
                    />
                </Field>

                <div className="grid grid-cols-2 gap-4">
                    {/* Hot Score Threshold */}
                    <Field label="Hot Score Threshold">
                        <input
                            type="number"
                            value={form.hotScoreThreshold}
                            onChange={(e) => setForm({ ...form, hotScoreThreshold: Number(e.target.value) })}
                            className="input"
                            min={0}
                        />
                    </Field>

                    {/* Daily Post Limit */}
                    <Field label="Daily Post Limit">
                        <input
                            type="number"
                            value={form.dailyPostLimit}
                            onChange={(e) => setForm({ ...form, dailyPostLimit: Number(e.target.value) })}
                            className="input"
                            min={1}
                        />
                    </Field>
                </div>

                {/* Threads Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Threads API Credentials
                        <span className="text-xs font-normal ml-2">(optional — needed for publishing)</span>
                    </h3>

                    <Field label="Threads User ID">
                        <input
                            type="text"
                            value={form.threadsAppId}
                            onChange={(e) => setForm({ ...form, threadsAppId: e.target.value })}
                            placeholder="e.g. 25909735278694109"
                            className="input"
                        />
                    </Field>

                    <Field label="Threads Access Token">
                        <input
                            type="password"
                            value={form.threadsToken}
                            onChange={(e) => setForm({ ...form, threadsToken: e.target.value })}
                            placeholder="Long-lived access token"
                            className="input"
                        />
                    </Field>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={loading}
                        className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {loading ? "Creating..." : "Create Workspace"}
                    </button>
                    <button
                        type="button"
                        onClick={() => router.back()}
                        className="px-6 py-2.5 border border-border text-muted hover:text-foreground text-sm rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                </div>
            </form>
        </div>
    );
}

function Field({
    label,
    hint,
    required,
    children,
}: {
    label: string;
    hint?: string;
    required?: boolean;
    children: React.ReactNode;
}) {
    return (
        <label className="block">
            <span className="text-sm font-medium text-foreground">
                {label}
                {required && <span className="text-danger ml-1">*</span>}
            </span>
            {hint && <span className="text-xs text-muted block mt-0.5">{hint}</span>}
            <div className="mt-1.5">{children}</div>

            <style jsx global>{`
        .input {
          width: 100%;
          padding: 0.5rem 0.75rem;
          background: var(--surface);
          border: 1px solid var(--border-color);
          border-radius: 0.5rem;
          color: var(--foreground);
          font-size: 0.875rem;
          outline: none;
          transition: border-color 0.2s;
        }
        .input:focus {
          border-color: var(--accent);
        }
        .input::placeholder {
          color: var(--muted);
        }
      `}</style>
        </label>
    );
}
