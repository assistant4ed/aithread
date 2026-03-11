"use client";

import { useState } from "react";

interface PromptTemplate {
    id: string;
    name: string;
    description: string;
    basePrompt: string;
    category: "news" | "education" | "product" | "community";
}

const PROMPT_TEMPLATES: PromptTemplate[] = [
    {
        id: "tech-news",
        name: "Tech News Curator",
        description: "Viral-style tech news aggregator",
        category: "news",
        basePrompt: "You are a viral tech news curator for developers and tech enthusiasts. Synthesize posts into punchy, high-signal summaries that feel like insider knowledge. Focus on: breaking product launches, AI developments, developer tools, and industry drama. Tone: energetic, slightly irreverent, zero fluff."
    },
    {
        id: "ai-educator",
        name: "AI Educator",
        description: "Clear explanations of AI concepts",
        category: "education",
        basePrompt: "You are an AI educator breaking down complex concepts for professionals. Make technical topics accessible without dumbing them down. Focus on: practical applications, real-world examples, and actionable insights. Tone: authoritative but approachable, patient, clear."
    },
    {
        id: "product-announcer",
        name: "Product Announcer",
        description: "Feature launches and product updates",
        category: "product",
        basePrompt: "You are a product marketing voice announcing new features and updates. Highlight user benefits over technical specs. Focus on: what's new, why it matters, and how to get started. Tone: exciting, clear, user-focused, never salesy."
    },
    {
        id: "community-builder",
        name: "Community Builder",
        description: "Conversation-starting community posts",
        category: "community",
        basePrompt: "You are a community manager sparking discussions and sharing member wins. Synthesize posts into conversation starters that encourage engagement. Focus on: community highlights, hot debates, shared challenges, and wins. Tone: warm, inclusive, enthusiastic."
    },
    {
        id: "data-analyst",
        name: "Data Analyst",
        description: "Data-driven insights and trends",
        category: "news",
        basePrompt: "You are a data analyst sharing insights from market research and industry trends. Turn numbers into compelling narratives. Focus on: surprising statistics, trend analysis, and actionable takeaways. Tone: analytical, insightful, evidence-based."
    },
    {
        id: "thought-leader",
        name: "Thought Leader",
        description: "Opinion-driven industry commentary",
        category: "community",
        basePrompt: "You are an industry thought leader sharing bold perspectives. Take strong positions backed by evidence. Focus on: contrarian takes, future predictions, and paradigm shifts. Tone: confident, opinionated, provocative but respectful."
    },
    {
        id: "tutorial-creator",
        name: "Tutorial Creator",
        description: "Step-by-step how-to guides",
        category: "education",
        basePrompt: "You are a tutorial creator breaking down complex processes into simple steps. Make learning feel achievable. Focus on: clear instructions, prerequisites, expected outcomes, and troubleshooting. Tone: instructional, encouraging, patient."
    },
    {
        id: "startup-insider",
        name: "Startup Insider",
        description: "Startup ecosystem news and analysis",
        category: "news",
        basePrompt: "You are a startup ecosystem insider reporting on funding, launches, and market moves. Synthesize signals that matter to founders and investors. Focus on: fundraising announcements, pivots, market opportunities, and cautionary tales. Tone: savvy, insider, fast-paced."
    }
];

interface PromptBuilderProps {
    value: string;
    onChange: (prompt: string) => void;
}

export default function PromptBuilder({ value, onChange }: PromptBuilderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
    const [tone, setTone] = useState(50); // 0-100 scale (casual to professional)
    const [length, setLength] = useState(50); // 0-100 scale (concise to detailed)
    const [category, setCategory] = useState<string>("all");

    const handleSelectTemplate = (template: PromptTemplate) => {
        setSelectedTemplate(template);
        onChange(template.basePrompt);
    };

    const handleCustomize = () => {
        if (!selectedTemplate) return;

        let customized = selectedTemplate.basePrompt;

        // Adjust tone
        if (tone < 30) {
            customized += "\n\nStyle: Use casual language, emojis occasionally, and conversational tone. Write like you're texting a friend.";
        } else if (tone > 70) {
            customized += "\n\nStyle: Use professional language, avoid emojis, and maintain formal tone. Write like an industry publication.";
        }

        // Adjust length
        if (length < 30) {
            customized += "\n\nLength: Keep it ultra-concise. 2-3 sentences max. Every word counts.";
        } else if (length > 70) {
            customized += "\n\nLength: Provide comprehensive coverage. Include context, examples, and multiple perspectives.";
        }

        onChange(customized);
    };

    const filteredTemplates = category === "all"
        ? PROMPT_TEMPLATES
        : PROMPT_TEMPLATES.filter(t => t.category === category);

    return (
        <div className="space-y-3">
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className="w-full px-4 py-2.5 bg-surface border border-border rounded-lg text-sm font-medium hover:bg-white/5 transition-colors flex items-center justify-between"
            >
                <span>🎨 Prompt Builder Assistant</span>
                <span className="text-xs text-muted">
                    {isOpen ? "Close ↑" : "Open ↓"}
                </span>
            </button>

            {isOpen && (
                <div className="border border-border rounded-xl p-4 space-y-4 bg-surface/30 animate-fade-in">
                    {/* Category Filter */}
                    <div>
                        <label className="text-xs font-semibold text-muted uppercase tracking-wider block mb-2">
                            Choose a Template
                        </label>
                        <div className="flex gap-2 mb-3">
                            {["all", "news", "education", "product", "community"].map(cat => (
                                <button
                                    key={cat}
                                    type="button"
                                    onClick={() => setCategory(cat)}
                                    className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                                        category === cat
                                            ? "bg-accent text-white"
                                            : "bg-white/5 text-muted hover:bg-white/10"
                                    }`}
                                >
                                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                                </button>
                            ))}
                        </div>

                        {/* Template Grid */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {filteredTemplates.map(template => (
                                <button
                                    key={template.id}
                                    type="button"
                                    onClick={() => handleSelectTemplate(template)}
                                    className={`text-left p-3 rounded-lg border transition-all ${
                                        selectedTemplate?.id === template.id
                                            ? "border-accent bg-accent/10 ring-2 ring-accent/20"
                                            : "border-border hover:border-accent/30 hover:bg-white/5"
                                    }`}
                                >
                                    <div className="text-sm font-semibold mb-0.5">{template.name}</div>
                                    <div className="text-[10px] text-muted">{template.description}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Customization Sliders */}
                    {selectedTemplate && (
                        <div className="space-y-4 pt-4 border-t border-border/50">
                            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider">
                                Customize Style
                            </h4>

                            {/* Tone */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-xs text-muted">Tone</label>
                                    <span className="text-xs font-mono">
                                        {tone < 30 ? "Casual" : tone > 70 ? "Professional" : "Balanced"}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={tone}
                                    onChange={(e) => setTone(Number(e.target.value))}
                                    className="w-full accent-accent"
                                />
                                <div className="flex justify-between text-[10px] text-muted/60 mt-1">
                                    <span>😎 Casual</span>
                                    <span>👔 Professional</span>
                                </div>
                            </div>

                            {/* Length */}
                            <div>
                                <div className="flex justify-between mb-2">
                                    <label className="text-xs text-muted">Length</label>
                                    <span className="text-xs font-mono">
                                        {length < 30 ? "Concise" : length > 70 ? "Detailed" : "Medium"}
                                    </span>
                                </div>
                                <input
                                    type="range"
                                    min="0"
                                    max="100"
                                    value={length}
                                    onChange={(e) => setLength(Number(e.target.value))}
                                    className="w-full accent-accent"
                                />
                                <div className="flex justify-between text-[10px] text-muted/60 mt-1">
                                    <span>⚡ Concise</span>
                                    <span>📚 Detailed</span>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex gap-2 pt-2">
                                <button
                                    type="button"
                                    onClick={handleCustomize}
                                    className="flex-1 px-4 py-2 bg-accent hover:bg-accent/80 text-white text-sm font-medium rounded-lg transition-colors"
                                >
                                    ✨ Apply Customization
                                </button>
                                <button
                                    type="button"
                                    onClick={() => onChange(selectedTemplate.basePrompt)}
                                    className="px-4 py-2 bg-white/5 border border-border text-sm font-medium rounded-lg hover:bg-white/10 transition-colors"
                                >
                                    Reset
                                </button>
                            </div>
                        </div>
                    )}

                    {/* Current Prompt Preview */}
                    {value && (
                        <div className="pt-4 border-t border-border/50">
                            <h4 className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">
                                Current Prompt
                            </h4>
                            <div className="p-3 bg-surface/50 rounded-lg border border-border/30 max-h-32 overflow-y-auto">
                                <p className="text-xs text-foreground/90 whitespace-pre-wrap font-mono">
                                    {value}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => {
                                    navigator.clipboard.writeText(value);
                                }}
                                className="mt-2 text-xs text-accent hover:text-accent/80 transition-colors"
                            >
                                📋 Copy to Clipboard
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
