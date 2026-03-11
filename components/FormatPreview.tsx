"use client";

import { PostFormat } from "@/lib/postFormats";
import { useState } from "react";

interface FormatPreviewProps {
    format: PostFormat;
    isSelected: boolean;
    onToggle: () => void;
}

export default function FormatPreview({ format, isSelected, onToggle }: FormatPreviewProps) {
    const [isExpanded, setIsExpanded] = useState(false);

    return (
        <div
            className={`relative flex flex-col gap-3 p-4 rounded-xl border transition-all cursor-pointer ${
                isSelected
                    ? "border-accent bg-accent/10 ring-2 ring-accent/20 shadow-lg"
                    : "border-border hover:border-accent/30 hover:bg-white/5"
            }`}
            onClick={onToggle}
        >
            {/* Header */}
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                        <h3 className="text-sm font-bold">{format.id.replace(/_/g, ' ')}</h3>
                        {isSelected && (
                            <span className="text-xs bg-accent text-white px-1.5 py-0.5 rounded font-medium">
                                ✓
                            </span>
                        )}
                    </div>
                    <p className="text-[10px] text-muted leading-relaxed">{format.description}</p>
                </div>
            </div>

            {/* Metadata Tags */}
            <div className="flex flex-wrap gap-1.5">
                {format.tone && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 text-[10px] font-medium">
                        🎭 {format.tone}
                    </span>
                )}
                {format.bestFor && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="inline-flex items-center px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[10px] font-medium hover:bg-blue-500/20 transition-colors"
                    >
                        💡 Best for...
                    </button>
                )}
            </div>

            {/* Visual Example Preview */}
            {format.visualExample && (
                <div className="mt-2 p-2.5 bg-surface/50 border border-border/50 rounded-lg">
                    <pre className="text-[9px] leading-relaxed text-muted/80 whitespace-pre-wrap font-mono overflow-hidden">
                        {format.visualExample}
                    </pre>
                </div>
            )}

            {/* Expanded Details */}
            {isExpanded && (
                <div
                    className="mt-3 pt-3 border-t border-border/50 space-y-3 animate-fade-in"
                    onClick={(e) => e.stopPropagation()}
                >
                    {format.bestFor && (
                        <div>
                            <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                                Best For
                            </h4>
                            <p className="text-xs text-foreground/90">{format.bestFor}</p>
                        </div>
                    )}

                    <div>
                        <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                            Structure
                        </h4>
                        <p className="text-xs text-foreground/90 font-mono">{format.structure}</p>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                            Example
                        </h4>
                        <div className="p-2.5 bg-surface/30 rounded-lg">
                            <p className="text-xs text-foreground/90 whitespace-pre-wrap">{format.example}</p>
                        </div>
                    </div>

                    <div>
                        <h4 className="text-[10px] font-semibold text-muted uppercase tracking-wider mb-1">
                            Trigger
                        </h4>
                        <p className="text-xs text-muted/80 italic">{format.trigger}</p>
                    </div>

                    <button
                        type="button"
                        onClick={() => setIsExpanded(false)}
                        className="text-[10px] text-accent hover:text-accent/80 font-medium transition-colors"
                    >
                        ↑ Collapse
                    </button>
                </div>
            )}
        </div>
    );
}

interface FormatGridProps {
    formats: Record<string, PostFormat>;
    selectedFormats: string[];
    onToggleFormat: (formatId: string) => void;
    searchQuery?: string;
    filterTone?: string;
}

export function FormatGrid({
    formats,
    selectedFormats,
    onToggleFormat,
    searchQuery = "",
    filterTone = "all"
}: FormatGridProps) {
    const formatArray = Object.values(formats);

    // Filter logic
    const filteredFormats = formatArray.filter(format => {
        const matchesSearch = searchQuery === "" ||
            format.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
            format.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
            format.bestFor?.toLowerCase().includes(searchQuery.toLowerCase());

        const matchesTone = filterTone === "all" || format.tone?.toLowerCase().includes(filterTone.toLowerCase());

        return matchesSearch && matchesTone;
    });

    return (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {filteredFormats.map(format => (
                <FormatPreview
                    key={format.id}
                    format={format}
                    isSelected={selectedFormats.includes(format.id)}
                    onToggle={() => onToggleFormat(format.id)}
                />
            ))}
        </div>
    );
}

interface FormatSelectorProps {
    selectedFormats: string[];
    onChange: (formats: string[]) => void;
}

export function FormatSelector({ selectedFormats, onChange }: FormatSelectorProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filterTone, setFilterTone] = useState("all");

    // Import formats dynamically
    const { POST_FORMATS } = require("@/lib/postFormats");

    const handleToggle = (formatId: string) => {
        const newFormats = selectedFormats.includes(formatId)
            ? selectedFormats.filter(f => f !== formatId)
            : [...selectedFormats, formatId];
        onChange(newFormats);
    };

    const handleSelectAll = () => {
        onChange(Object.keys(POST_FORMATS));
    };

    const handleSelectNone = () => {
        onChange([]);
    };

    const handleSelectRecommended = () => {
        // Recommend most versatile formats
        onChange(['LISTICLE', 'NEWS_FLASH', 'EXPLAINER', 'THREAD_STORM', 'RESOURCE_PACK', 'HOT_TAKE']);
    };

    const toneOptions = ["all", "urgent", "bold", "educational", "conversational", "analytical"];

    return (
        <div className="space-y-4">
            {/* Controls */}
            <div className="flex flex-col sm:flex-row gap-3">
                <input
                    type="text"
                    placeholder="Search formats..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="input flex-1 text-sm"
                />
                <select
                    value={filterTone}
                    onChange={(e) => setFilterTone(e.target.value)}
                    className="input text-sm sm:w-40"
                >
                    <option value="all">All Tones</option>
                    {toneOptions.slice(1).map(tone => (
                        <option key={tone} value={tone}>
                            {tone.charAt(0).toUpperCase() + tone.slice(1)}
                        </option>
                    ))}
                </select>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-wrap gap-2">
                <button
                    type="button"
                    onClick={handleSelectRecommended}
                    className="px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent text-xs font-medium rounded-lg hover:bg-accent/20 transition-colors"
                >
                    ⭐ Recommended ({6})
                </button>
                <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-3 py-1.5 bg-white/5 border border-border text-xs font-medium rounded-lg hover:bg-white/10 transition-colors"
                >
                    Select All ({Object.keys(POST_FORMATS).length})
                </button>
                <button
                    type="button"
                    onClick={handleSelectNone}
                    className="px-3 py-1.5 bg-white/5 border border-border text-xs font-medium rounded-lg hover:bg-white/10 transition-colors"
                >
                    Clear Selection
                </button>
                <div className="ml-auto text-xs text-muted flex items-center gap-1.5">
                    <span className="font-mono bg-accent/10 px-2 py-1 rounded border border-accent/20">
                        {selectedFormats.length} selected
                    </span>
                </div>
            </div>

            {/* Format Grid */}
            <FormatGrid
                formats={POST_FORMATS}
                selectedFormats={selectedFormats}
                onToggleFormat={handleToggle}
                searchQuery={searchQuery}
                filterTone={filterTone}
            />

            {/* Empty State */}
            {Object.values(POST_FORMATS).filter((f: any) => {
                const matchesSearch = searchQuery === "" ||
                    f.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    f.description.toLowerCase().includes(searchQuery.toLowerCase());
                const matchesTone = filterTone === "all" || f.tone?.toLowerCase().includes(filterTone.toLowerCase());
                return matchesSearch && matchesTone;
            }).length === 0 && (
                <div className="text-center py-12 text-muted">
                    <p className="text-sm">No formats match your search.</p>
                </div>
            )}
        </div>
    );
}
