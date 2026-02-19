"use client";

import { useRouter, useParams } from "next/navigation";
import { useState, useEffect } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";

export default function EditWorkspacePage() {
    const router = useRouter();
    const params = useParams();
    const workspaceId = params.id as string;

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        name: "",
        targetAccounts: "",
        translationPrompt: "",
        clusteringPrompt: "",
        synthesisLanguage: "",
        hotScoreThreshold: 50,
        threadsAppId: "",
        threadsToken: "",
        dailyPostLimit: 3,
        topicFilter: "",
        maxPostAgeHours: 48,
        postLookbackHours: 24,
        publishTimes: [] as string[],
        reviewWindowHours: 1,
        instagramAccountId: "",
        instagramAccessToken: "",
        twitterApiKey: "",
        twitterApiSecret: "",
        twitterAccessToken: "",
        twitterAccessSecret: "",
    });

    useEffect(() => {
        // Fetch existing workspace data
        const fetchWorkspace = async () => {
            try {
                const res = await fetch(`/api/workspaces/${workspaceId}`);
                if (!res.ok) throw new Error("Failed to load workspace");
                const data = await res.json();

                setForm({
                    name: data.name,
                    targetAccounts: data.targetAccounts.join(", "),
                    translationPrompt: data.translationPrompt,
                    clusteringPrompt: data.clusteringPrompt || "",
                    synthesisLanguage: data.synthesisLanguage || "Traditional Chinese (HK/TW)",
                    hotScoreThreshold: data.hotScoreThreshold,
                    threadsAppId: data.threadsAppId || "",
                    threadsToken: data.threadsToken || "",
                    dailyPostLimit: data.dailyPostLimit,
                    topicFilter: data.topicFilter || "",
                    maxPostAgeHours: data.maxPostAgeHours || 48,
                    postLookbackHours: data.postLookbackHours || 24,
                    publishTimes: data.publishTimes || ["12:00", "18:00", "22:00"],
                    reviewWindowHours: data.reviewWindowHours || 1,
                    instagramAccountId: data.instagramAccountId || "",
                    instagramAccessToken: data.instagramAccessToken || "",
                    twitterApiKey: data.twitterApiKey || "",
                    twitterApiSecret: data.twitterApiSecret || "",
                    twitterAccessToken: data.twitterAccessToken || "",
                    twitterAccessSecret: data.twitterAccessSecret || "",
                });
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };

        if (workspaceId) {
            fetchWorkspace();
        }
    }, [workspaceId]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setError("");

        try {
            const res = await fetch(`/api/workspaces/${workspaceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: form.name,
                    targetAccounts: form.targetAccounts
                        .split(",")
                        .map((a) => a.trim().replace(/^@/, ""))
                        .filter(Boolean),
                    translationPrompt: form.translationPrompt,
                    clusteringPrompt: form.clusteringPrompt,
                    synthesisLanguage: form.synthesisLanguage,
                    hotScoreThreshold: Number(form.hotScoreThreshold),
                    threadsAppId: form.threadsAppId || null,
                    threadsToken: form.threadsToken || null,
                    dailyPostLimit: Number(form.dailyPostLimit),
                    topicFilter: form.topicFilter || null,
                    maxPostAgeHours: Number(form.maxPostAgeHours),
                    postLookbackHours: Number(form.postLookbackHours),
                    publishTimes: form.publishTimes,
                    reviewWindowHours: Number(form.reviewWindowHours),
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
                throw new Error(data.error || "Failed to update workspace");
            }

            router.push(`/workspaces/${workspaceId}`);
            router.refresh();
        } catch (err: any) {
            setError(err.message);
        } finally {
            setSaving(false);
        }
    };

    if (loading) return <div className="text-center py-12 text-muted">Loading...</div>;

    return (
        <div className="max-w-2xl mx-auto animate-fade-in">
            <div className="mb-6">
                <Link
                    href={`/workspaces/${workspaceId}`}
                    className="text-sm text-muted hover:text-foreground transition-colors mb-2 block"
                >
                    ← Back to Workspace
                </Link>
                <h1 className="text-2xl font-bold tracking-tight">Edit Workspace <span className="text-xs font-normal text-muted">(v0.2.1)</span></h1>
            </div>

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
                <Field label="Clustering Prompt" hint="Instructions for the AI to group posts into news clusters">
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
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                            Threads Connection
                        </h3>
                        {form.threadsToken ? (
                            <span className="text-xs bg-success/10 text-success px-2 py-1 rounded border border-success/20 font-medium flex items-center gap-1">
                                ✓ Connected
                            </span>
                        ) : (
                            <span className="text-xs bg-surface text-muted px-2 py-1 rounded border border-border font-medium">
                                Not Connected
                            </span>
                        )}
                    </div>

                    <p className="text-xs text-muted">
                        Connect your Threads account to enable auto-publishing.
                    </p>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                document.cookie = `connect_workspace_id=${workspaceId}; path=/; max-age=300`;
                                signIn("threads", { callbackUrl: window.location.href });
                            }}
                            className="px-4 py-2 bg-black hover:bg-black/80 text-white border border-white/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            {form.threadsToken ? "Reconnect Threads" : "Connect Threads"}
                        </button>
                    </div>

                    <details className="mt-4 text-xs">
                        <summary className="cursor-pointer text-muted hover:text-foreground transition-colors font-medium">
                            Manual Setup (Advanced)
                        </summary>
                        <div className="mt-4 space-y-4 pt-4 border-t border-border/50">
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
                                    placeholder="Paste access token here"
                                    className="input"
                                />
                            </Field>
                        </div>
                    </details>
                </div>



                {/* Instagram Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                            Instagram Connection
                        </h3>
                        {form.instagramAccessToken ? (
                            <span className="text-xs bg-success/10 text-success px-2 py-1 rounded border border-success/20 font-medium flex items-center gap-1">
                                ✓ Connected
                            </span>
                        ) : (
                            <span className="text-xs bg-surface text-muted px-2 py-1 rounded border border-border font-medium">
                                Not Connected
                            </span>
                        )}
                    </div>

                    <p className="text-xs text-muted">
                        Connect your Instagram account to enable auto-publishing.
                    </p>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                document.cookie = `connect_workspace_id=${workspaceId}; path=/; max-age=300`;
                                signIn("facebook", { callbackUrl: window.location.href });
                            }}
                            className="px-4 py-2 bg-[#E1306C] hover:bg-[#C13584] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            {form.instagramAccessToken ? "Reconnect Instagram" : "Connect Instagram"}
                        </button>
                    </div>

                    <details className="mt-4 text-xs">
                        <summary className="cursor-pointer text-muted hover:text-foreground transition-colors font-medium">
                            Manual Setup (Advanced)
                        </summary>
                        <div className="mt-4 space-y-4 pt-4 border-t border-border/50">
                            <Field label="Instagram Account ID">
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
                                    placeholder="Paste access token here"
                                    className="input"
                                />
                            </Field>
                        </div>
                    </details>
                </div>

                {/* Twitter Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                            X (Twitter) Connection
                        </h3>
                        {form.twitterAccessToken ? (
                            <span className="text-xs bg-success/10 text-success px-2 py-1 rounded border border-success/20 font-medium flex items-center gap-1">
                                ✓ Connected
                            </span>
                        ) : (
                            <span className="text-xs bg-surface text-muted px-2 py-1 rounded border border-border font-medium">
                                Not Connected
                            </span>
                        )}
                    </div>

                    <p className="text-xs text-muted">
                        Connect your X (Twitter) account to enable auto-publishing.
                    </p>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => {
                                document.cookie = `connect_workspace_id=${workspaceId}; path=/; max-age=1000`;
                                signIn("twitter", { callbackUrl: window.location.href });
                            }}
                            className="px-4 py-2 bg-black hover:bg-black/80 text-white border border-white/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-2"
                        >
                            {form.twitterAccessToken ? "Reconnect X (Twitter)" : "Connect X (Twitter)"}
                        </button>
                    </div>

                    <details className="mt-4 text-xs" open={!!form.twitterApiKey}>
                        <summary className="cursor-pointer text-muted hover:text-foreground transition-colors font-medium">
                            Manual Setup (Required for media uploads)
                        </summary>
                        <div className="mt-4 space-y-4 pt-4 border-t border-border/50">
                            <div className="grid grid-cols-2 gap-4">
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
                            <div className="grid grid-cols-2 gap-4">
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
                    </details>
                </div>

                {/* Actions */}
                <div className="flex gap-3 pt-2">
                    <button
                        type="submit"
                        disabled={saving}
                        className="px-6 py-2.5 bg-accent hover:bg-accent-hover text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                    >
                        {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <Link
                        href={`/workspaces/${workspaceId}`}
                        className="px-6 py-2.5 border border-border text-muted hover:text-foreground text-sm rounded-lg transition-colors inline-block text-center"
                    >
                        Cancel
                    </Link>
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
