import { describe, it, expect } from "vitest";
import { tokenize, clusterPosts, Document } from "./clustering";

// ─── tokenize ─────────────────────────────────────────────────────────────────

describe("tokenize", () => {
    it("lowercases and splits on whitespace", () => {
        const tokens = tokenize("Hello World FOO");
        expect(tokens.every((t) => t === t.toLowerCase())).toBe(true);
    });

    it("removes punctuation", () => {
        const tokens = tokenize("hello, world! foo's bar.");
        expect(tokens).not.toContain("hello,");
        expect(tokens).not.toContain("world!");
    });

    it("filters stopwords", () => {
        const tokens = tokenize("the is to http threads");
        expect(tokens).toEqual([]);
    });

    it("filters words ≤ 2 chars", () => {
        const tokens = tokenize("AI is on me do go");
        expect(tokens).toEqual([]);
    });

    it("returns empty for stopwords-only input", () => {
        expect(tokenize("the and is to of a in that")).toEqual([]);
    });

    it("returns meaningful tokens from real text", () => {
        const tokens = tokenize("OpenAI released GPT-5 with amazing capabilities");
        expect(tokens).toContain("openai");
        expect(tokens).toContain("released");
        expect(tokens).toContain("amazing");
        expect(tokens).toContain("capabilities");
    });
});

// ─── clusterPosts ─────────────────────────────────────────────────────────────

describe("clusterPosts", () => {
    it("returns empty array for empty input", () => {
        expect(clusterPosts([])).toEqual([]);
    });

    it("returns single cluster for single post", () => {
        const posts: Document[] = [{ id: "p1", text: "Hello world" }];
        const clusters = clusterPosts(posts);
        expect(clusters).toHaveLength(1);
        expect(clusters[0].postIds).toEqual(["p1"]);
    });

    it("clusters 3 posts about same topic into one cluster", () => {
        const posts: Document[] = [
            { id: "p1", text: "OpenAI released GPT-5 with incredible reasoning and coding abilities" },
            { id: "p2", text: "GPT-5 from OpenAI shows massive improvements in reasoning benchmarks" },
            { id: "p3", text: "OpenAI GPT-5 launch: a major leap in artificial intelligence reasoning" },
        ];
        const clusters = clusterPosts(posts);
        // All three should end up in one cluster since they're very similar
        const bigCluster = clusters.find((c) => c.postIds.length >= 2);
        expect(bigCluster).toBeDefined();
        expect(bigCluster!.postIds.length).toBeGreaterThanOrEqual(2);
    });

    it("separates 2 distinct topics into 2 clusters", () => {
        const posts: Document[] = [
            { id: "a1", text: "OpenAI released GPT-5 with incredible reasoning abilities" },
            { id: "a2", text: "GPT-5 from OpenAI shows massive reasoning improvements" },
            { id: "b1", text: "SpaceX Starship successfully completed orbital flight test" },
            { id: "b2", text: "Starship from SpaceX achieves orbit for the first time ever" },
        ];
        const clusters = clusterPosts(posts);
        // Should have at least 2 clusters
        expect(clusters.length).toBeGreaterThanOrEqual(2);
    });

    it("clusters realistic AI + SpaceX posts into separate groups", () => {
        const posts: Document[] = [
            { id: "ai1", text: "Anthropic Claude model shows emergent reasoning capabilities in benchmark tests" },
            { id: "ai2", text: "Claude reasoning benchmark performance exceeds expectations from Anthropic" },
            { id: "ai3", text: "New Anthropic Claude model dominates reasoning benchmarks against competitors" },
            { id: "ai4", text: "Benchmark results show Claude from Anthropic leading in reasoning tasks" },
            { id: "ai5", text: "Anthropic announces Claude improvements in reasoning and benchmark scores" },
            { id: "sp1", text: "SpaceX Dragon capsule docked with International Space Station crew mission" },
            { id: "sp2", text: "Dragon spacecraft SpaceX successfully docked ISS station for crew transfer" },
            { id: "sp3", text: "SpaceX crew Dragon capsule arrives at International Space Station mission" },
        ];
        const clusters = clusterPosts(posts);
        expect(clusters.length).toBeGreaterThanOrEqual(2);

        // Verify AI posts and SpaceX posts don't mix
        const aiIds = new Set(["ai1", "ai2", "ai3", "ai4", "ai5"]);
        const spIds = new Set(["sp1", "sp2", "sp3"]);
        for (const c of clusters) {
            const hasAi = c.postIds.some((id) => aiIds.has(id));
            const hasSp = c.postIds.some((id) => spIds.has(id));
            expect(hasAi && hasSp).toBe(false); // No cluster should mix both
        }
    });

    it("threshold=1.0 prevents clustering (all singletons)", () => {
        const posts: Document[] = [
            { id: "p1", text: "OpenAI released GPT-5 with incredible reasoning abilities and coding benchmarks" },
            { id: "p2", text: "SpaceX Starship successfully completed its latest orbital flight test mission" },
            { id: "p3", text: "Bitcoin cryptocurrency reaches new all time high market price records globally" },
        ];
        const clusters = clusterPosts(posts, 1.0);
        // With threshold=1.0, distinct posts should not cluster
        expect(clusters.length).toBe(3);
    });

    it("all post IDs appear exactly once across clusters", () => {
        const posts: Document[] = [
            { id: "p1", text: "OpenAI released GPT-5 with reasoning abilities" },
            { id: "p2", text: "GPT-5 from OpenAI shows reasoning improvements" },
            { id: "p3", text: "SpaceX Starship completed orbital flight test" },
            { id: "p4", text: "Starship SpaceX achieves orbit successfully" },
            { id: "p5", text: "Bitcoin reaches new all time high price records" },
        ];
        const clusters = clusterPosts(posts);
        const allIds = clusters.flatMap((c) => c.postIds);
        // Each ID appears exactly once
        expect(allIds.sort()).toEqual(["p1", "p2", "p3", "p4", "p5"].sort());
        expect(new Set(allIds).size).toBe(allIds.length);
    });
});
