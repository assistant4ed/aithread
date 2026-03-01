import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock all external dependencies
vi.mock("@/lib/prisma", () => ({
    prisma: {
        synthesizedArticle: {
            count: vi.fn(),
            findMany: vi.fn(),
            findFirst: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        post: {
            findMany: vi.fn(),
        },
        workspace: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}));

vi.mock("@/lib/threads_client", () => ({
    createContainer: vi.fn().mockResolvedValue("container-123"),
    publishContainer: vi.fn().mockResolvedValue("published-456"),
    waitForContainer: vi.fn().mockResolvedValue(undefined),
    refreshLongLivedToken: vi.fn().mockResolvedValue({
        access_token: "new-token",
        expires_in: 5_184_000,
    }),
    getThread: vi.fn().mockResolvedValue({ permalink: "https://www.threads.net/t/xyz" }),
}));

vi.mock("@/lib/instagram_client", () => ({
    createInstagramContainer: vi.fn().mockResolvedValue("ig-container-1"),
    publishInstagramContainer: vi.fn().mockResolvedValue("ig-published-1"),
    waitForInstagramContainer: vi.fn().mockResolvedValue(undefined),
    getInstagramMedia: vi.fn().mockResolvedValue({ permalink: "https://instagram.com/p/abc" }),
}));

vi.mock("@/lib/twitter_client", () => ({
    uploadTwitterMedia: vi.fn().mockResolvedValue("tw-media-1"),
    postTweet: vi.fn().mockResolvedValue({ id: "tweet-123" }),
}));

vi.mock("@/lib/sanitizer", () => ({
    stripPlatformReferences: vi.fn((text: string) => text || ""),
}));

vi.mock("@/lib/time", () => ({
    todayStartHKT: vi.fn(() => {
        const d = new Date();
        d.setUTCHours(0, 0, 0, 0);
        return d;
    }),
}));

import { prisma } from "@/lib/prisma";
import {
    checkAndPublishApprovedPosts,
    getDailyPublishCount,
    ensureValidThreadsToken,
    PublisherConfig,
} from "./publisher_service";

// Use unique workspace IDs to avoid cross-test interference from publishingInProgress Set
let wsCounter = 0;
function makeConfig(overrides: Partial<PublisherConfig> = {}): PublisherConfig {
    wsCounter++;
    return {
        workspaceId: `ws-${wsCounter}`,
        threadsUserId: "threads-user-1",
        threadsAccessToken: "valid-token",
        translationPrompt: "",
        dailyLimit: 3,
        ...overrides,
    };
}

// ─── getDailyPublishCount ─────────────────────────────────────────────────────

describe("getDailyPublishCount", () => {
    beforeEach(() => vi.clearAllMocks());

    it("queries articles published today for the workspace", async () => {
        (prisma.synthesizedArticle.count as any).mockResolvedValue(2);
        const count = await getDailyPublishCount("ws-test");
        expect(count).toBe(2);
        expect(prisma.synthesizedArticle.count).toHaveBeenCalledWith(
            expect.objectContaining({
                where: expect.objectContaining({
                    workspaceId: "ws-test",
                    status: "PUBLISHED",
                }),
            })
        );
    });
});

// ─── ensureValidThreadsToken ──────────────────────────────────────────────────

describe("ensureValidThreadsToken", () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns null when workspace has no token", async () => {
        (prisma.workspace.findUnique as any).mockResolvedValue({ threadsToken: null });
        const token = await ensureValidThreadsToken("ws-test");
        expect(token).toBeNull();
    });

    it("returns existing token when not near expiry", async () => {
        const futureExpiry = Math.floor(Date.now() / 1000) + 30 * 86400; // 30 days
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "current-token",
            threadsExpiresAt: futureExpiry,
        });
        const token = await ensureValidThreadsToken("ws-test");
        expect(token).toBe("current-token");
    });

    it("refreshes token when expiring within 7 days", async () => {
        const soonExpiry = Math.floor(Date.now() / 1000) + 3 * 86400; // 3 days
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "old-token",
            threadsExpiresAt: soonExpiry,
        });
        (prisma.workspace.update as any).mockResolvedValue({});

        const token = await ensureValidThreadsToken("ws-test");
        expect(token).toBe("new-token");
        expect(prisma.workspace.update).toHaveBeenCalled();
    });
});

// ─── checkAndPublishApprovedPosts ─────────────────────────────────────────────

describe("checkAndPublishApprovedPosts", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it("skips when daily limit is reached", async () => {
        const config = makeConfig();
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "token",
            threadsExpiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        });
        (prisma.synthesizedArticle.count as any).mockResolvedValue(3); // Already published 3

        const stats = await checkAndPublishApprovedPosts(config);
        expect(stats.reason).toContain("Daily limit reached");
        expect(stats.published).toBe(0);
    });

    it("returns early when no approved articles", async () => {
        const config = makeConfig();
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "token",
            threadsExpiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        });
        (prisma.synthesizedArticle.count as any)
            .mockResolvedValueOnce(0) // getDailyPublishCount
            .mockResolvedValueOnce(0); // approvedReady count
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue(null); // no cooldown
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([]);

        const stats = await checkAndPublishApprovedPosts(config);
        expect(stats.reason).toContain("No articles");
        expect(stats.published).toBe(0);
    });

    it("publishes one article with maxPublish=1 (default)", async () => {
        const config = makeConfig();
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "token",
            threadsExpiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        });
        (prisma.synthesizedArticle.count as any)
            .mockResolvedValueOnce(0) // getDailyPublishCount
            .mockResolvedValueOnce(3); // approvedReady count
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue(null); // no cooldown
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            {
                id: "article-1",
                articleContent: "Test content",
                sourcePostIds: [],
                selectedMediaUrl: null,
                selectedMediaType: null,
            },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});
        (prisma.post.findMany as any).mockResolvedValue([]);

        // Run publish and advance timers for the 30s wait + 5s container wait
        const publishPromise = checkAndPublishApprovedPosts(config);
        await vi.advanceTimersByTimeAsync(40_000);
        const stats = await publishPromise;

        expect(stats.published).toBe(1);
        expect(stats.approvedReady).toBe(3);
    });

    it("respects maxPublish parameter", async () => {
        const config = makeConfig();
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "token",
            threadsExpiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        });
        (prisma.synthesizedArticle.count as any)
            .mockResolvedValueOnce(0) // getDailyPublishCount
            .mockResolvedValueOnce(2); // approvedReady count
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue(null); // no cooldown
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            {
                id: "article-1",
                articleContent: "Content 1",
                sourcePostIds: [],
                selectedMediaUrl: null,
            },
            {
                id: "article-2",
                articleContent: "Content 2",
                sourcePostIds: [],
                selectedMediaUrl: null,
            },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});
        (prisma.post.findMany as any).mockResolvedValue([]);

        const publishPromise = checkAndPublishApprovedPosts(config, 2);
        await vi.advanceTimersByTimeAsync(120_000); // enough for 2 articles + delays
        const stats = await publishPromise;

        expect(stats.published).toBe(2);
    });

    it("sets article status to ERROR on publish failure", async () => {
        const config = makeConfig();
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "token",
            threadsExpiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        });
        (prisma.synthesizedArticle.count as any)
            .mockResolvedValueOnce(0)
            .mockResolvedValueOnce(1);
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue(null); // no cooldown
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            {
                id: "article-fail",
                articleContent: "Some content",
                sourcePostIds: [],
                selectedMediaUrl: null,
            },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});
        (prisma.post.findMany as any).mockResolvedValue([]);

        // Make threads fail so publishArticle throws
        const { createContainer } = await import("@/lib/threads_client");
        (createContainer as any).mockRejectedValueOnce(new Error("API error"));

        const publishPromise = checkAndPublishApprovedPosts(config);
        await vi.advanceTimersByTimeAsync(40_000);
        const stats = await publishPromise;

        expect(stats.failed).toBe(1);
        expect(prisma.synthesizedArticle.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id: "article-fail" },
                data: expect.objectContaining({
                    status: "ERROR",
                    publishError: "Failed to publish to any configured platform.",
                    publishRetryCount: { increment: 1 },
                }),
            })
        );
    });

    it("prevents concurrent publish for same workspace", async () => {
        const config = makeConfig();
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "token",
            threadsExpiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        });
        (prisma.synthesizedArticle.count as any).mockResolvedValue(0);
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue(null); // no cooldown
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            {
                id: "a1",
                articleContent: "Content",
                sourcePostIds: [],
                selectedMediaUrl: null,
            },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});
        (prisma.post.findMany as any).mockResolvedValue([]);

        // Launch two concurrent publishes with SAME config (same workspaceId)
        const p1 = checkAndPublishApprovedPosts(config);
        const p2 = checkAndPublishApprovedPosts(config);

        await vi.advanceTimersByTimeAsync(60_000);
        const [r1, r2] = await Promise.all([p1, p2]);

        // One should succeed, one should be skipped
        const results = [r1, r2];
        const skipped = results.find((r) => r.reason?.includes("already in progress"));
        expect(skipped).toBeDefined();
    });
});

// ─── Cooldown ──────────────────────────────────────────────────────────────────

describe("inter-publish cooldown", () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    function setupTokenMock() {
        (prisma.workspace.findUnique as any).mockResolvedValue({
            threadsToken: "token",
            threadsExpiresAt: Math.floor(Date.now() / 1000) + 30 * 86400,
        });
    }

    it("skips when last published <30min ago", async () => {
        const config = makeConfig();
        setupTokenMock();
        (prisma.synthesizedArticle.count as any).mockResolvedValue(0); // getDailyPublishCount
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue({
            publishedAt: new Date(Date.now() - 10 * 60_000), // 10 minutes ago
        });

        const stats = await checkAndPublishApprovedPosts(config);
        expect(stats.reason).toContain("Cooldown");
        expect(stats.published).toBe(0);
    });

    it("publishes when last published >30min ago", async () => {
        const config = makeConfig();
        setupTokenMock();
        (prisma.synthesizedArticle.count as any)
            .mockResolvedValueOnce(0) // getDailyPublishCount
            .mockResolvedValueOnce(1); // approvedReady
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue({
            publishedAt: new Date(Date.now() - 45 * 60_000), // 45 minutes ago
        });
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            {
                id: "article-cool",
                articleContent: "Cooled down content",
                sourcePostIds: [],
                selectedMediaUrl: null,
                selectedMediaType: null,
            },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});
        (prisma.post.findMany as any).mockResolvedValue([]);

        const publishPromise = checkAndPublishApprovedPosts(config);
        await vi.advanceTimersByTimeAsync(40_000);
        const stats = await publishPromise;

        expect(stats.published).toBe(1);
    });

    it("publishes when no previous articles exist", async () => {
        const config = makeConfig();
        setupTokenMock();
        (prisma.synthesizedArticle.count as any)
            .mockResolvedValueOnce(0) // getDailyPublishCount
            .mockResolvedValueOnce(1); // approvedReady
        (prisma.synthesizedArticle.findFirst as any).mockResolvedValue(null); // no published articles
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            {
                id: "article-first",
                articleContent: "First article",
                sourcePostIds: [],
                selectedMediaUrl: null,
                selectedMediaType: null,
            },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});
        (prisma.post.findMany as any).mockResolvedValue([]);

        const publishPromise = checkAndPublishApprovedPosts(config);
        await vi.advanceTimersByTimeAsync(40_000);
        const stats = await publishPromise;

        expect(stats.published).toBe(1);
    });
});
