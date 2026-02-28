import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock all external dependencies before imports
const mockCreateChatCompletion = vi.fn();

vi.mock("@/lib/ai/provider", () => ({
    getProvider: vi.fn(() => ({
        createChatCompletion: mockCreateChatCompletion,
    })),
    FallbackProvider: class MockFallbackProvider {
        constructor(_providers: any[]) {}
        createChatCompletion = mockCreateChatCompletion;
    },
}));

vi.mock("@/lib/prisma", () => ({
    prisma: {
        synthesizedArticle: { findMany: vi.fn(), create: vi.fn() },
        post: { findMany: vi.fn(), updateMany: vi.fn() },
        workspace: { findUnique: vi.fn() },
    },
}));

vi.mock("openai", () => ({
    default: vi.fn().mockImplementation(() => ({
        images: { generate: vi.fn() },
    })),
}));

vi.mock("@google/generative-ai", () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
        getGenerativeModel: vi.fn(),
    })),
}));

vi.mock("@/lib/storage", () => ({
    uploadBufferToStorage: vi.fn(),
    uploadMediaToStorage: vi.fn(),
}));

import { synthesizeCluster, translateText, clusterPostsWithLLM, checkAutoApproval, runSynthesisEngine } from "./synthesis_engine";
import { stripPlatformReferences } from "./sanitizer";
import { prisma } from "@/lib/prisma";

// ─── synthesizeCluster ────────────────────────────────────────────────────────

describe("synthesizeCluster", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const samplePosts = [
        { content: "OpenAI released GPT-5", account: "openai", url: "https://threads.net/@openai/post/1" },
        { content: "GPT-5 is incredible", account: "techguy", url: "https://threads.net/@techguy/post/2" },
    ];

    it("constructs prompt with LISTICLE format rules", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Test", content: "Test content" })
        );

        await synthesizeCluster(samplePosts, "LISTICLE", undefined);
        const callArgs = mockCreateChatCompletion.mock.calls[0];
        const systemPrompt = callArgs[0][0].content;
        expect(systemPrompt).toContain("LISTICLE");
    });

    it("constructs prompt with NEWS_FLASH format rules", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Breaking", content: "Flash content" })
        );

        await synthesizeCluster(samplePosts, "NEWS_FLASH", undefined);
        const callArgs = mockCreateChatCompletion.mock.calls[0];
        const systemPrompt = callArgs[0][0].content;
        expect(systemPrompt).toContain("NEWS_FLASH");
    });

    it("falls back to LISTICLE for unknown formatId", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Test", content: "Content" })
        );

        await synthesizeCluster(samplePosts, "NONEXISTENT_FORMAT", undefined);
        const callArgs = mockCreateChatCompletion.mock.calls[0];
        const systemPrompt = callArgs[0][0].content;
        expect(systemPrompt).toContain("LISTICLE");
    });

    it("injects user-provided synthesisPrompt", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Custom", content: "Custom content" })
        );

        await synthesizeCluster(samplePosts, "LISTICLE", "Write like a pirate");
        const callArgs = mockCreateChatCompletion.mock.calls[0];
        const systemPrompt = callArgs[0][0].content;
        expect(systemPrompt).toContain("Write like a pirate");
    });

    it("uses default prompt when no synthesisPrompt provided", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Default", content: "Default content" })
        );

        await synthesizeCluster(samplePosts, "LISTICLE", undefined);
        const callArgs = mockCreateChatCompletion.mock.calls[0];
        const systemPrompt = callArgs[0][0].content;
        expect(systemPrompt).toContain("viral social media editor");
    });

    it("calls stripPlatformReferences on post content", async () => {
        const postsWithMentions = [
            { content: "Check @[OpenAI](https://openai.com) news", account: "test", url: "https://test.com" },
        ];

        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Test", content: "Content" })
        );

        await synthesizeCluster(postsWithMentions, "LISTICLE", undefined);
        const callArgs = mockCreateChatCompletion.mock.calls[0];
        const userContent = callArgs[0][1].content;
        // The post content should be stripped of @mentions
        expect(userContent).not.toContain("@[OpenAI]");
        expect(userContent).toContain("OpenAI");
    });

    it('parses { headline, content } JSON response', async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Big News", content: "Article body here" })
        );

        const result = await synthesizeCluster(samplePosts, "LISTICLE", undefined);
        expect(result).toEqual({ headline: "Big News", content: "Article body here" });
    });

    it("joins content array to string if LLM returns array", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "List", content: ["Item 1", "Item 2", "Item 3"] })
        );

        const result = await synthesizeCluster(samplePosts, "LISTICLE", undefined);
        expect(result!.content).toBe("Item 1\nItem 2\nItem 3");
    });

    it("strips suggestions field from response", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ headline: "Test", content: "Body", suggestions: "Use an image" })
        );

        const result = await synthesizeCluster(samplePosts, "LISTICLE", undefined);
        expect(result).not.toHaveProperty("suggestions");
    });

    it("returns null when provider returns null", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(null);

        const result = await synthesizeCluster(samplePosts, "LISTICLE", undefined);
        expect(result).toBeNull();
    });

    it("returns null on JSON parse error", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce("not valid json {{{");

        const result = await synthesizeCluster(samplePosts, "LISTICLE", undefined);
        expect(result).toBeNull();
    });
});

// ─── translateText ────────────────────────────────────────────────────────────

describe("translateText", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("passes prompt + text to provider correctly", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce("翻譯後的文字");

        await translateText("Hello world", "Translate to Chinese");
        expect(mockCreateChatCompletion).toHaveBeenCalledWith(
            [
                { role: "system", content: "Translate to Chinese" },
                { role: "user", content: "Hello world" },
            ],
            expect.objectContaining({ temperature: 0.1 })
        );
    });

    it("returns translated text", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce("翻譯後的文字");

        const result = await translateText("Hello world", "Translate to Chinese");
        expect(result).toBe("翻譯後的文字");
    });

    it("returns original text when provider returns null", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(null);

        const result = await translateText("Hello world", "Translate to Chinese");
        expect(result).toBe("Hello world");
    });

    it("returns original text on exception", async () => {
        mockCreateChatCompletion.mockRejectedValueOnce(new Error("API Error"));

        const result = await translateText("Hello world", "Translate to Chinese");
        expect(result).toBe("Hello world");
    });
});

// ─── clusterPostsWithLLM ─────────────────────────────────────────────────────

describe("clusterPostsWithLLM", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns empty array for empty input", async () => {
        const result = await clusterPostsWithLLM([], "Group related posts");
        expect(result).toEqual([]);
        expect(mockCreateChatCompletion).not.toHaveBeenCalled();
    });

    it("sends posts with short numeric indices (not CUIDs)", async () => {
        const posts = [
            { id: "clxyz123abc", text: "Post about AI" },
            { id: "clxyz456def", text: "Post about SpaceX" },
        ];

        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ clusters: [{ topic: "Mixed", postIds: ["1", "2"] }] })
        );

        await clusterPostsWithLLM(posts, "Group related posts");
        const userContent = mockCreateChatCompletion.mock.calls[0][0][1].content;
        expect(userContent).toContain("[1]");
        expect(userContent).toContain("[2]");
        expect(userContent).not.toContain("clxyz123abc");
    });

    it("maps LLM indices back to real post IDs", async () => {
        const posts = [
            { id: "real-id-aaa", text: "Post about AI" },
            { id: "real-id-bbb", text: "Post about AI too" },
            { id: "real-id-ccc", text: "Post about AI three" },
        ];

        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({
                clusters: [{ topic: "AI", postIds: ["1", "2", "3"] }],
            })
        );

        const result = await clusterPostsWithLLM(posts, "Group posts");
        expect(result[0].postIds).toEqual(["real-id-aaa", "real-id-bbb", "real-id-ccc"]);
    });

    it("filters clusters to 2+ posts only", async () => {
        const posts = [
            { id: "id1", text: "Post one about AI" },
            { id: "id2", text: "Post two about AI" },
            { id: "id3", text: "Post three standalone" },
        ];

        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({
                clusters: [
                    { topic: "AI", postIds: ["1", "2"] },
                    { topic: "Solo", postIds: ["3"] }, // Should be filtered out
                ],
            })
        );

        const result = await clusterPostsWithLLM(posts, "Group posts");
        expect(result).toHaveLength(1);
        expect(result[0].postIds).toEqual(["id1", "id2"]);
    });

    it("falls back to TF-IDF when provider returns null", async () => {
        const posts = [
            { id: "id1", text: "OpenAI released GPT-5 with incredible reasoning abilities" },
            { id: "id2", text: "GPT-5 from OpenAI shows massive reasoning improvements" },
        ];

        mockCreateChatCompletion.mockResolvedValueOnce(null);

        const result = await clusterPostsWithLLM(posts, "Group posts");
        // Should fallback to TF-IDF clustering — should still return clusters
        expect(Array.isArray(result)).toBe(true);
    });

    it("falls back to TF-IDF on JSON parse error", async () => {
        const posts = [
            { id: "id1", text: "OpenAI released GPT-5 with incredible reasoning abilities" },
            { id: "id2", text: "GPT-5 from OpenAI shows massive reasoning improvements" },
        ];

        mockCreateChatCompletion.mockResolvedValueOnce("invalid json!!!{{{");

        const result = await clusterPostsWithLLM(posts, "Group posts");
        expect(Array.isArray(result)).toBe(true);
    });
});

// ─── checkAutoApproval ───────────────────────────────────────────────────────

describe("checkAutoApproval", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const instruction = "Approve if the news is relevant to tech/AI and logically coherent. Reject spam.";

    it("returns true when LLM approves", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: true, reason: "Relevant tech news" })
        );

        const result = await checkAutoApproval("GPT-5 Released", "OpenAI released GPT-5 today.", instruction);
        expect(result).toBe(true);
    });

    it("returns false when LLM rejects", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: false, reason: "Promotional spam" })
        );

        const result = await checkAutoApproval("Buy Now!", "Amazing deal click here.", instruction);
        expect(result).toBe(false);
    });

    it("includes instruction in prompt", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: true, reason: "ok" })
        );

        await checkAutoApproval("Title", "Content", "Only approve AI news");
        const userContent = mockCreateChatCompletion.mock.calls[0][0][1].content;
        expect(userContent).toContain("Only approve AI news");
    });

    it("includes title and content in prompt", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: true, reason: "ok" })
        );

        await checkAutoApproval("My Title", "My article content here", instruction);
        const userContent = mockCreateChatCompletion.mock.calls[0][0][1].content;
        expect(userContent).toContain("My Title");
        expect(userContent).toContain("My article content here");
    });

    it("returns false when provider returns null", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(null);

        const result = await checkAutoApproval("Title", "Content", instruction);
        expect(result).toBe(false);
    });

    it("returns false on JSON parse error", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce("not json {{{");

        const result = await checkAutoApproval("Title", "Content", instruction);
        expect(result).toBe(false);
    });

    it("returns false on provider exception", async () => {
        mockCreateChatCompletion.mockRejectedValueOnce(new Error("API Error"));

        const result = await checkAutoApproval("Title", "Content", instruction);
        expect(result).toBe(false);
    });

    it("uses response_format json_object", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: true, reason: "ok" })
        );

        await checkAutoApproval("Title", "Content", instruction);
        const options = mockCreateChatCompletion.mock.calls[0][1];
        expect(options.response_format).toEqual({ type: "json_object" });
    });

    it("uses low temperature for deterministic moderation", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: true, reason: "ok" })
        );

        await checkAutoApproval("Title", "Content", instruction);
        const options = mockCreateChatCompletion.mock.calls[0][1];
        expect(options.temperature).toBe(0.1);
    });

    it("system prompt contains 'lenient'", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: true, reason: "ok" })
        );

        await checkAutoApproval("Title", "Content", instruction);
        const systemContent = mockCreateChatCompletion.mock.calls[0][0][0].content;
        expect(systemContent).toContain("lenient");
    });

    it("user prompt contains 'APPROVE unless'", async () => {
        mockCreateChatCompletion.mockResolvedValueOnce(
            JSON.stringify({ approved: true, reason: "ok" })
        );

        await checkAutoApproval("Title", "Content", instruction);
        const userContent = mockCreateChatCompletion.mock.calls[0][0][1].content;
        expect(userContent).toContain("APPROVE unless");
    });
});

// ─── maxArticles cap ──────────────────────────────────────────────────────────

describe("maxArticles cap", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("only creates N articles when maxArticles is set", async () => {
        // Setup: 3 posts that form 3 separate clusters, but maxArticles=1
        const posts = [
            { id: "p1", contentOriginal: "AI news about GPT-5 release and capabilities", sourceAccount: "author1", coherenceStatus: "PENDING", threadId: "t1", externalUrls: [], hotScore: 10, sourceUrl: null, sourceType: "ACCOUNT", sourceId: "s1", mediaUrls: [] },
            { id: "p2", contentOriginal: "AI news about GPT-5 release confirmed today", sourceAccount: "author2", coherenceStatus: "PENDING", threadId: "t2", externalUrls: [], hotScore: 10, sourceUrl: null, sourceType: "ACCOUNT", sourceId: "s1", mediaUrls: [] },
            { id: "p3", contentOriginal: "SpaceX launched another rocket to Mars orbit", sourceAccount: "author3", coherenceStatus: "PENDING", threadId: "t3", externalUrls: [], hotScore: 10, sourceUrl: null, sourceType: "ACCOUNT", sourceId: "s1", mediaUrls: [] },
            { id: "p4", contentOriginal: "SpaceX Mars mission rocket launched successfully", sourceAccount: "author4", coherenceStatus: "PENDING", threadId: "t4", externalUrls: [], hotScore: 10, sourceUrl: null, sourceType: "ACCOUNT", sourceId: "s1", mediaUrls: [] },
            { id: "p5", contentOriginal: "Apple Vision Pro headset sales are declining fast", sourceAccount: "author5", coherenceStatus: "PENDING", threadId: "t5", externalUrls: [], hotScore: 10, sourceUrl: null, sourceType: "ACCOUNT", sourceId: "s1", mediaUrls: [] },
            { id: "p6", contentOriginal: "Apple Vision Pro sales numbers dropping significantly", sourceAccount: "author6", coherenceStatus: "PENDING", threadId: "t6", externalUrls: [], hotScore: 10, sourceUrl: null, sourceType: "ACCOUNT", sourceId: "s1", mediaUrls: [] },
        ];

        (prisma.post.findMany as any).mockResolvedValue(posts);
        (prisma.workspace.findUnique as any).mockResolvedValue({ autoApproveDrafts: false });
        (prisma.synthesizedArticle.create as any).mockResolvedValue({ id: "article-1" });
        (prisma.post.updateMany as any).mockResolvedValue({ count: 2 });

        // Mock LLM: clustering returns 3 clusters
        mockCreateChatCompletion
            .mockResolvedValueOnce(JSON.stringify({
                clusters: [
                    { topic: "GPT-5", postIds: ["1", "2"] },
                    { topic: "SpaceX", postIds: ["3", "4"] },
                    { topic: "Apple", postIds: ["5", "6"] },
                ]
            }))
            // classify cluster
            .mockResolvedValueOnce(JSON.stringify({ format: "NEWS_FLASH", reason: "breaking" }))
            // synthesize cluster
            .mockResolvedValueOnce(JSON.stringify({ headline: "GPT-5 News", content: "Article about GPT-5" }))
            // translate content
            .mockResolvedValueOnce("翻譯內容")
            // translate title
            .mockResolvedValueOnce("翻譯標題");

        const stats = await runSynthesisEngine("ws-1", {
            translationPrompt: "",
            clusteringPrompt: "Group posts",
            synthesisLanguage: "Traditional Chinese",
            maxArticles: 1,
        });

        expect(stats.articlesGenerated).toBe(1);
        // Only 1 article created despite 3 valid clusters
        expect(prisma.synthesizedArticle.create).toHaveBeenCalledTimes(1);
    });
});
