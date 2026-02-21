"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { signIn } from "next-auth/react";

const DEFAULT_PROMPT = ""; // Empty by default, user can add style like "Use casual tone"

export default function NewWorkspacePage() {
    const router = useRouter();
    const [loading, setLoading] = useState(false);
    const [discovering, setDiscovering] = useState(false);
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
        sources: [] as any[],
        aiProvider: "GROQ",
        aiModel: "llama-3.3-70b-versatile",
        aiApiKey: "",
        synthesisPrompt: "You are a viral social media editor. Synthesize these clustered social media posts into a high-impact, skimmable curated summary.",
    });

    const handleConnectOAuth = async (provider: string) => {
        if (!form.name) {
            setError("Please enter a workspace name first");
            return;
        }

        setLoading(true);
        setError("");

        try {
            // 1. Create the workspace first (POST)
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
                    sources: form.sources,
                    aiProvider: form.aiProvider,
                    aiModel: form.aiModel,
                    aiApiKey: form.aiApiKey || null,
                    synthesisPrompt: form.synthesisPrompt,
                }),
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "Failed to create workspace before OAuth");
            }

            const workspace = await res.json();

            // 2. Set the cookie and trigger OAuth
            document.cookie = `connect_workspace_id=${workspace.id}; path=/; max-age=300`;
            await signIn(provider, { callbackUrl: `${window.location.origin}/workspaces/${workspace.id}/edit` });
        } catch (err: any) {
            setError(err.message);
            setLoading(false);
        }
    };

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
                    sources: form.sources,
                    aiProvider: form.aiProvider,
                    aiModel: form.aiModel,
                    aiApiKey: form.aiApiKey || null,
                    synthesisPrompt: form.synthesisPrompt,
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

    const handleDiscover = async () => {
        const topic = form.topicFilter || form.name;
        if (!topic) {
            setError("Please enter a workspace name or topic filter first to help the AI find accounts.");
            return;
        }

        setDiscovering(true);
        setError("");

        try {
            const res = await fetch("/api/discover-accounts", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ topic }),
            });

            if (!res.ok) throw new Error("Failed to discover accounts");

            const { handles } = await res.json();
            if (handles && handles.length > 0) {
                const existing = form.targetAccounts ? form.targetAccounts.split(",").map(a => a.trim()) : [];
                const combined = Array.from(new Set([...existing, ...handles.map((h: string) => `@${h}`)]));
                setForm({ ...form, targetAccounts: combined.join(", ") });
            } else {
                setError("AI couldn't find any valid accounts for this topic. Try a broader topic.");
            }
        } catch (err: any) {
            setError(err.message);
        } finally {
            setDiscovering(false);
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

                {/* Scraper Sources */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                            Scraper Sources
                        </h3>
                        <div className="text-[10px] text-muted-foreground bg-accent/5 px-2 py-0.5 rounded border border-accent/20">
                            NEW: Hybrid Pipeline
                        </div>
                    </div>

                    <p className="text-xs text-muted mb-4">
                        Add specific accounts or hashtags to monitor. Topic-based scraping requires quality gates to filter noise.
                    </p>

                    <div className="space-y-3">
                        {form.sources.map((source, idx) => (
                            <div key={idx} className="flex flex-col gap-3 p-3 bg-white/5 rounded-lg border border-border/50">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${source.type === 'TOPIC' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'}`}>
                                            {source.type}
                                        </span>
                                        <span className="text-sm font-medium">{source.value}</span>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const newSources = [...form.sources];
                                            newSources.splice(idx, 1);
                                            setForm({ ...form, sources: newSources });
                                        }}
                                        className="text-muted hover:text-danger transition-colors"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                            <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                        </svg>
                                    </button>
                                </div>

                                {source.type === 'TOPIC' && (
                                    <div className="grid grid-cols-3 gap-3">
                                        <div>
                                            <label className="text-[10px] text-muted block mb-1">Min Likes</label>
                                            <input
                                                type="number"
                                                value={source.minLikes || 100}
                                                onChange={(e) => {
                                                    const newSources = [...form.sources];
                                                    newSources[idx] = { ...newSources[idx], minLikes: Number(e.target.value) };
                                                    setForm({ ...form, sources: newSources });
                                                }}
                                                className="input text-xs py-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-muted block mb-1">Min Replies</label>
                                            <input
                                                type="number"
                                                value={source.minReplies || 5}
                                                onChange={(e) => {
                                                    const newSources = [...form.sources];
                                                    newSources[idx] = { ...newSources[idx], minReplies: Number(e.target.value) };
                                                    setForm({ ...form, sources: newSources });
                                                }}
                                                className="input text-xs py-1"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[10px] text-muted block mb-1">Max Age (h)</label>
                                            <input
                                                type="number"
                                                value={source.maxAgeHours || 3}
                                                onChange={(e) => {
                                                    const newSources = [...form.sources];
                                                    newSources[idx] = { ...newSources[idx], maxAgeHours: Number(e.target.value) };
                                                    setForm({ ...form, sources: newSources });
                                                }}
                                                className="input text-xs py-1"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                        ))}

                        {/* Add New Source */}
                        <div className="p-4 border border-dashed border-border/50 rounded-lg bg-surface/30">
                            <div className="flex gap-2 items-end">
                                <div className="flex-1">
                                    <label className="text-[10px] text-muted block mb-1">New Source (@user or #tag)</label>
                                    <input
                                        type="text"
                                        id="new-source-value"
                                        placeholder="@username or #hashtag"
                                        className="input text-sm"
                                        onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                (document.getElementById('add-source-btn') as HTMLElement).click();
                                            }
                                        }}
                                    />
                                </div>
                                <button
                                    type="button"
                                    id="add-source-btn"
                                    onClick={() => {
                                        const input = document.getElementById('new-source-value') as HTMLInputElement;
                                        let val = input.value.trim();
                                        if (!val) return;

                                        const type = val.startsWith('#') ? 'TOPIC' : 'ACCOUNT';
                                        if (type === 'ACCOUNT' && !val.startsWith('@')) val = '@' + val;

                                        const newSource = {
                                            type,
                                            value: val,
                                            platform: 'THREADS',
                                            isActive: true,
                                            minLikes: type === 'TOPIC' ? 100 : null,
                                            minReplies: type === 'TOPIC' ? 5 : null,
                                            maxAgeHours: type === 'TOPIC' ? 3 : null,
                                            trustWeight: type === 'ACCOUNT' ? 1.0 : 0.7,
                                        };

                                        setForm({ ...form, sources: [...form.sources, newSource] });
                                        input.value = '';
                                    }}
                                    className="px-4 py-2 bg-white/5 border border-border rounded-lg text-sm hover:bg-white/10"
                                >
                                    + Add
                                </button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* AI Configuration */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        AI Provider Configuration
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Field label="AI Provider">
                            <select
                                value={form.aiProvider}
                                onChange={(e) => setForm({ ...form, aiProvider: e.target.value })}
                                className="input"
                            >
                                <option value="GROQ">Groq (Fast, Llama 3)</option>
                                <option value="OPENAI">OpenAI (GPT-4o/mini)</option>
                                <option value="CLAUDE">Claude (Anthropic)</option>
                            </select>
                        </Field>
                        <Field label="AI Model">
                            <input
                                type="text"
                                value={form.aiModel}
                                onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                                placeholder={form.aiProvider === "GROQ" ? "llama-3.3-70b-versatile" : form.aiProvider === "OPENAI" ? "gpt-4o-mini" : "claude-3-5-sonnet-20241022"}
                                className="input"
                            />
                        </Field>
                    </div>

                    <Field label="Provider API Key (Optional)" hint="Override the global API key for this workspace.">
                        <input
                            type="password"
                            value={form.aiApiKey}
                            onChange={(e) => setForm({ ...form, aiApiKey: e.target.value })}
                            placeholder="sk-..."
                            className="input"
                        />
                    </Field>
                </div>

                {/* Legacy Target Accounts (for reference) */}
                <Field label="Target Accounts (Legacy)" hint="Comma-separated Threads usernames. Prefer the 'Scraper Sources' section above.">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={form.targetAccounts}
                            onChange={(e) => setForm({ ...form, targetAccounts: e.target.value })}
                            placeholder="@openai, @nvidia, @meta"
                            className="input flex-1"
                        />
                        <button
                            type="button"
                            onClick={handleDiscover}
                            disabled={discovering}
                            className="px-4 py-2 bg-surface border border-border rounded-lg text-sm hover:bg-white/5 disabled:opacity-50 whitespace-nowrap"
                        >
                            {discovering ? "Finding..." : "🤖 Auto-Discover"}
                        </button>
                    </div>
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

                {/* Synthesis Prompt */}
                <Field label="Synthesis Personality / Prompt" hint="Instructions for the AI on how to write the news articles (tone, style, etc.)">
                    <textarea
                        value={form.synthesisPrompt}
                        onChange={(e) => setForm({ ...form, synthesisPrompt: e.target.value })}
                        rows={4}
                        placeholder="e.g. You are a viral social media editor. Write like a Gen-Z tech influencer..."
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

                    <p className="text-xs text-muted">
                        Connect your Threads account to enable auto-publishing:
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => handleConnectOAuth("threads")}
                            disabled={loading}
                            className="px-4 py-2 bg-black hover:bg-black/80 text-white border border-white/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            Connect Threads
                        </button>
                    </div>

                    <details className="mt-4 text-xs">
                        <summary className="cursor-pointer text-muted hover:text-foreground transition-colors font-medium">
                            Manual Setup (Advanced)
                        </summary>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
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
                    </details>
                </div>

                {/* Instagram Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        Instagram publishing
                        <span className="text-xs font-normal ml-2">(optional)</span>
                    </h3>

                    <p className="text-xs text-muted">
                        Connect your Instagram account to enable auto-publishing:
                    </p>

                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg space-y-2">
                        <p className="text-[11px] text-amber-200/80 leading-relaxed">
                            <strong className="text-amber-400">Requirements:</strong> Instagram account must be set to <strong className="text-amber-400">Professional (Business or Creator)</strong> and linked to a <strong className="text-amber-400">Facebook Page</strong> that you manage.
                        </p>
                    </div>

                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => handleConnectOAuth("facebook")}
                            disabled={loading}
                            className="px-4 py-2 bg-[#E1306C] hover:bg-[#C13584] text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            Connect Instagram
                        </button>
                    </div>

                    <details className="mt-4 text-xs">
                        <summary className="cursor-pointer text-muted hover:text-foreground transition-colors font-medium">
                            Manual Setup (Advanced)
                        </summary>
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-border/50">
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
                    </details>
                </div>

                {/* Twitter Credentials */}
                <div className="border border-border rounded-xl p-4 space-y-4">
                    <h3 className="text-sm font-semibold text-muted uppercase tracking-wider">
                        X (Twitter) publishing
                        <span className="text-xs font-normal ml-2">(optional)</span>
                    </h3>

                    <p className="text-xs text-muted">
                        Connect your X (Twitter) account to enable auto-publishing:
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => handleConnectOAuth("twitter")}
                            disabled={loading}
                            className="px-4 py-2 bg-black hover:bg-black/80 text-white border border-white/20 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                        >
                            Connect X (Twitter)
                        </button>
                    </div>

                    <details className="mt-4 text-xs">
                        <summary className="cursor-pointer text-muted hover:text-foreground transition-colors font-medium">
                            Manual Setup (Advanced)
                        </summary>
                        <div className="mt-4 space-y-4 pt-4 border-t border-border/50">
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
                    </details>
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
