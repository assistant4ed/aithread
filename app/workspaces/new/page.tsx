"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const DEFAULT_PROMPT = ""; // Empty by default, user can add style like "Use casual tone"

export default function NewWorkspacePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        name: "",
        targetAccounts: "",
        translationPrompt: DEFAULT_PROMPT,
        clusteringPrompt: "",
        synthesisLanguage: "Traditional Chinese (HK/TW)",
        hotScoreThreshold: 50,
        threadsAppId: "",
        threadsToken: "",
        dailyPostLimit: 3,
        topicFilter: "",
        maxPostAgeHours: 48,
        postLookbackHours: 24,
        publishTimes: ["12:00", "18:00", "22:00"],
        reviewWindowHours: 1,
        instagramAccountId: "",
        instagramAccessToken: "",
        twitterApiKey: "",
        twitterApiSecret: "",
        twitterAccessToken: "",
        twitterAccessSecret: "",
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
                    maxPostAgeHours: Number(form.maxPostAgeHours),
                    postLookbackHours: Number(form.postLookbackHours),
                    publishTimes: form.publishTimes,
                    reviewWindowHours: Number(form.reviewWindowHours),
                    topicFilter: form.topicFilter || null,
                    clusteringPrompt: form.clusteringPrompt || null,
                    instagramAccountId: form.instagramAccountId || null,
                    instagramAccessToken: form.instagramAccessToken || null,
                    twitterApiKey: form.twitterApiKey || null,
                    twitterApiSecret: form.twitterApiSecret || null,
                    twitterAccessToken: form.twitterAccessToken || null,
                    twitterAccessSecret: form.twitterAccessSecret || null,
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

                {/* Translation Prompt -> Style Instructions */}
                <Field label="Translation Style / Instructions (Optional)" hint="Add specific instructions (e.g. 'Use professional tone', 'Avoid slang'). Target language is controlled below.">
                    <textarea
                        value={form.translationPrompt}
                        onChange={(e) => setForm({ ...form, translationPrompt: e.target.value })}
                        rows={3}
                        placeholder="e.g. Use a formal, journalistic tone."
                        className="input font-mono text-xs"
                    />
                </Field>

                {/* Clustering Prompt */}
                <Field label="Clustering Prompt (Optional)" hint="Instructions for the AI to group posts into news clusters">
                    <textarea
                        value={form.clusteringPrompt}
                        onChange={(e) => setForm({ ...form, clusteringPrompt: e.target.value })}
                        rows={4}
                        placeholder="Group these posts into news clusters..."
                        className="input font-mono text-xs"
                    />
                </Field>



                {/* Synthesis Language */}
                <Field label="Synthesis Language" hint="Target language for synthesized articles">
                    <input
                        type="text"
                        value={form.synthesisLanguage}
                        onChange={(e) => setForm({ ...form, synthesisLanguage: e.target.value })}
                        placeholder="e.g. Traditional Chinese (HK/TW)"
                        className="input"
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

                <div className="grid grid-cols-2 gap-4">
                    {/* Max Post Age */}
                    <Field label="Max Post Age (hours)" hint="Skip posts older than this">
                        <input
                            type="number"
                            value={form.maxPostAgeHours}
                            onChange={(e) => setForm({ ...form, maxPostAgeHours: Number(e.target.value) })}
                            className="input"
                            min={1}
                        />
                    </Field>

                    {/* Post Lookback */}
                    <Field label="Synthesis Lookback (hours)" hint="How far back to look for clustering">
                        <input
                            type="number"
                            value={form.postLookbackHours}
                            onChange={(e) => setForm({ ...form, postLookbackHours: Number(e.target.value) })}
                            className="input"
                            min={1}
                        />
                    </Field>
                </div>

                {/* Pipeline Schedule */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Pipeline Schedule (UTC+8)
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Publish Times */}
                        <Field label="Publish Times" hint="When do you want articles to go live?">
                            <div className="flex flex-wrap gap-2 mb-3">
                                {form.publishTimes.map((time, i) => (
                                    <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-accent/10 border border-accent/20 text-accent text-sm">
                                        {time}
                                        <button
                                            type="button"
                                            onClick={() => {
                                                const newTimes = [...form.publishTimes];
                                                newTimes.splice(i, 1);
                                                setForm({ ...form, publishTimes: newTimes });
                                            }}
                                            className="text-accent/60 hover:text-accent font-bold"
                                        >
                                            ×
                                        </button>
                                    </span>
                                ))}
                                {form.publishTimes.length === 0 && (
                                    <span className="text-xs text-muted italic py-1">No times set</span>
                                )}
                            </div>
                            <div className="flex gap-2">
                                <input
                                    type="time"
                                    className="input w-32"
                                    id="new-time-input"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        const input = document.getElementById("new-time-input") as HTMLInputElement;
                                        if (input.value) {
                                            if (!form.publishTimes.includes(input.value)) {
                                                const newTimes = [...form.publishTimes, input.value].sort();
                                                setForm({ ...form, publishTimes: newTimes });
                                            }
                                            input.value = "";
                                        }
                                    }}
                                    className="px-3 py-1 bg-surface border border-border rounded-lg text-sm hover:bg-white/5"
                                >
                                    + Add
                                </button>
                            </div>
                        </Field>

                        {/* Review Window */}
                        <Field label="Review Window (Hours)" hint="Hours before publish time to generate drafts">
                            <input
                                type="number"
                                value={form.reviewWindowHours}
                                onChange={(e) => setForm({ ...form, reviewWindowHours: Number(e.target.value) })}
                                className="input"
                                min={1}
                                max={12}
                            />
                        </Field>
                    </div>

                    {/* Pipeline Preview */}
                    <div className="mt-4 p-3 bg-white/5 rounded-lg text-xs font-mono text-muted/80">
                        <div className="mb-2 font-sans font-semibold text-muted">Pipeline Preview:</div>
                        {form.publishTimes.length > 0 ? form.publishTimes.map((time) => {
                            const [h, m] = time.split(":").map(Number);
                            const pubDate = new Date();
                            pubDate.setHours(h, m, 0, 0);

                            const synthDate = new Date(pubDate);
                            synthDate.setHours(h - (form.reviewWindowHours || 1));

                            const scrapeStart = new Date(synthDate);
                            scrapeStart.setHours(scrapeStart.getHours() - 2);

                            const fmt = (d: Date) => d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });

                            return (
                                <div key={time} className="flex items-center gap-2 mb-1">
                                    <span className="text-blue-400">Scrape {fmt(scrapeStart)}</span>
                                    <span>→</span>
                                    <span className="text-purple-400">Draft {fmt(synthDate)}</span>
                                    <span>→</span>
                                    <span className="text-muted">Review</span>
                                    <span>→</span>
                                    <span className="text-green-400 font-bold">Publish {time}</span>
                                </div>
                            );
                        }) : <div>No pipeline configured.</div>}
                    </div>
                </div>

                {/* Threads Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Threads publishing
                        <span className="text-xs font-normal ml-2">(optional)</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                placeholder="Long-lived token"
                                className="input"
                            />
                        </Field>
                    </div>
                </div>

                {/* Instagram Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Instagram publishing
                        <span className="text-xs font-normal ml-2">(optional)</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Instagram account ID">
                            <input
                                type="text"
                                value={form.instagramAccountId}
                                onChange={(e) => setForm({ ...form, instagramAccountId: e.target.value })}
                                placeholder="e.g. 17841401234567890"
                                className="input"
                            />
                        </Field>
                        <Field label="Instagram Access Token">
                            <input
                                type="password"
                                value={form.instagramAccessToken}
                                onChange={(e) => setForm({ ...form, instagramAccessToken: e.target.value })}
                                placeholder="Access token"
                                className="input"
                            />
                        </Field>
                    </div>
                </div>

                {/* Twitter Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        X (Twitter) publishing
                        <span className="text-xs font-normal ml-2">(optional)</span>
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="API Key">
                            <input
                                type="text"
                                value={form.twitterApiKey}
                                onChange={(e) => setForm({ ...form, twitterApiKey: e.target.value })}
                                className="input"
                            />
                        </Field>
                        <Field label="API Secret">
                            <input
                                type="password"
                                value={form.twitterApiSecret}
                                onChange={(e) => setForm({ ...form, twitterApiSecret: e.target.value })}
                                className="input"
                            />
                        </Field>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="Access Token">
                            <input
                                type="password"
                                value={form.twitterAccessToken}
                                onChange={(e) => setForm({ ...form, twitterAccessToken: e.target.value })}
                                className="input"
                            />
                        </Field>
                        <Field label="Access Secret">
                            <input
                                type="password"
                                value={form.twitterAccessSecret}
                                onChange={(e) => setForm({ ...form, twitterAccessSecret: e.target.value })}
                                className="input"
                            />
                        </Field>
                    </div>
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
            </form >
        </div >
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
