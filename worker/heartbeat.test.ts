import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma before importing heartbeat functions
vi.mock("@/lib/prisma", () => ({
    prisma: {
        synthesizedArticle: {
            findMany: vi.fn(),
            update: vi.fn(),
            count: vi.fn(),
        },
        workspace: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        post: {
            count: vi.fn(),
        },
        pipelineRun: {
            deleteMany: vi.fn(),
            create: vi.fn(),
            update: vi.fn(),
        },
        scrapeLog: {
            aggregate: vi.fn(),
        },
    },
}));

vi.mock("@/lib/queue", () => ({
    scrapeQueue: { add: vi.fn() },
    removePendingScrapes: vi.fn(),
    ScrapeJobData: {},
}));

vi.mock("@/lib/publisher_service", () => ({
    checkAndPublishApprovedPosts: vi.fn(),
    getDailyPublishCount: vi.fn().mockResolvedValue(0),
}));

vi.mock("@/lib/synthesis_engine", () => ({
    runSynthesisEngine: vi.fn().mockResolvedValue({ articlesGenerated: 0 }),
}));

vi.mock("@/lib/pipeline_tracker", () => ({
    trackPipelineRun: vi.fn((_wsId: string, _phase: string, fn: () => any) => fn()),
}));

vi.mock("@/lib/storage", () => ({
    deleteBlobFromStorage: vi.fn(),
}));

// Re-export toUTCDate so stagger uses the real implementation
vi.mock("@/lib/time", async () => {
    const actual = await vi.importActual<typeof import("@/lib/time")>("@/lib/time");
    return actual;
});

import { prisma } from "@/lib/prisma";
import { staggerArticleSchedules } from "./heartbeat";

// ─── staggerArticleSchedules ──────────────────────────────────────────────────

describe("staggerArticleSchedules", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    function makeWorkspace(publishTimes: string[]) {
        return {
            id: "ws-1",
            publishTimes,
            name: "Test",
        } as any;
    }

    it("does nothing when only 1 article exists", async () => {
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            { id: "a1", scheduledPublishAt: new Date("2026-02-28T04:00:00Z") }, // 12:00 HKT
        ]);

        await staggerArticleSchedules(
            makeWorkspace(["12:00", "18:00", "22:00"]),
            "12:00"
        );

        expect(prisma.synthesizedArticle.update).not.toHaveBeenCalled();
    });

    it("staggers 3 articles across 3 publish windows", async () => {
        // 12:00 HKT = 04:00 UTC
        const targetUTC = new Date();
        // We need to know the actual UTC value toUTCDate would produce
        // For this test, we mock the findMany to return articles
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            { id: "a1" },
            { id: "a2" },
            { id: "a3" },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});

        await staggerArticleSchedules(
            makeWorkspace(["12:00", "18:00", "22:00"]),
            "12:00"
        );

        // a1 keeps 12:00, a2→18:00, a3→22:00
        expect(prisma.synthesizedArticle.update).toHaveBeenCalledTimes(2);

        // Verify the update calls reassigned to different times
        const call1 = (prisma.synthesizedArticle.update as any).mock.calls[0][0];
        const call2 = (prisma.synthesizedArticle.update as any).mock.calls[1][0];
        expect(call1.where.id).toBe("a2");
        expect(call2.where.id).toBe("a3");

        // Verify they got different scheduled times
        const time1 = new Date(call1.data.scheduledPublishAt).getTime();
        const time2 = new Date(call2.data.scheduledPublishAt).getTime();
        expect(time2).toBeGreaterThan(time1);
    });

    it("uses tomorrow slots when today's windows are exhausted", async () => {
        // Only 1 remaining slot today (22:00), but 3 articles total
        // a1 stays at 18:00, a2→22:00, a3→tomorrow's 12:00
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            { id: "a1" },
            { id: "a2" },
            { id: "a3" },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});

        await staggerArticleSchedules(
            makeWorkspace(["12:00", "18:00", "22:00"]),
            "18:00"
        );

        expect(prisma.synthesizedArticle.update).toHaveBeenCalledTimes(2);

        // First reassignment should be 22:00 today, second should be tomorrow 12:00
        const call1 = (prisma.synthesizedArticle.update as any).mock.calls[0][0];
        const call2 = (prisma.synthesizedArticle.update as any).mock.calls[1][0];
        const time1 = new Date(call1.data.scheduledPublishAt);
        const time2 = new Date(call2.data.scheduledPublishAt);

        // time2 should be later than time1 (next day)
        expect(time2.getTime()).toBeGreaterThan(time1.getTime());
    });

    it("handles workspace with only one publish time", async () => {
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            { id: "a1" },
            { id: "a2" },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});

        await staggerArticleSchedules(
            makeWorkspace(["18:00"]),
            "18:00"
        );

        // a2 should be pushed to tomorrow's 18:00
        expect(prisma.synthesizedArticle.update).toHaveBeenCalledTimes(1);
        const call = (prisma.synthesizedArticle.update as any).mock.calls[0][0];
        expect(call.where.id).toBe("a2");
    });

    it("queries both APPROVED and PENDING_REVIEW articles", async () => {
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([]);

        await staggerArticleSchedules(
            makeWorkspace(["12:00", "18:00"]),
            "12:00"
        );

        const queryArgs = (prisma.synthesizedArticle.findMany as any).mock.calls[0][0];
        expect(queryArgs.where.status).toEqual({ in: ["APPROVED", "PENDING_REVIEW"] });
    });
});

// ─── toUTCDate (via stagger behavior) ─────────────────────────────────────────

describe("timezone handling", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("stagger slots are 6 hours apart when publish times are 12:00/18:00/00:00 HKT", async () => {
        // Verify that toUTCDate preserves the relative spacing between HKT times.
        // 12:00 → 18:00 HKT = 6 hours apart in UTC as well.
        (prisma.synthesizedArticle.findMany as any).mockResolvedValue([
            { id: "a1" },
            { id: "a2" },
        ]);
        (prisma.synthesizedArticle.update as any).mockResolvedValue({});

        await staggerArticleSchedules(
            { id: "ws-tz", publishTimes: ["12:00", "18:00"] } as any,
            "12:00"
        );

        // a2 gets reassigned to 18:00 HKT slot
        const call = (prisma.synthesizedArticle.update as any).mock.calls[0][0];
        const reassignedTime = new Date(call.data.scheduledPublishAt);

        // The query used 12:00 HKT, reassignment should be 18:00 HKT = 6 hours later
        const queryArgs = (prisma.synthesizedArticle.findMany as any).mock.calls[0][0];
        const originalTime = new Date(queryArgs.where.scheduledPublishAt);

        const diffHours = (reassignedTime.getTime() - originalTime.getTime()) / 3_600_000;
        expect(diffHours).toBe(6);
    });
});

// ─── Scheduling edge cases ────────────────────────────────────────────────────

describe("scheduling edge cases", () => {
    it("synthesis_engine now uses toUTCDate — no server TZ drift", async () => {
        // Both heartbeat and synthesis_engine now use toUTCDate from lib/time.ts,
        // which explicitly creates "+08:00" dates regardless of server timezone.
        const { toUTCDate } = await import("@/lib/time");
        const ref = new Date();
        const candidate = toUTCDate("18:00", ref);

        // 18:00 HKT = 10:00 UTC, always — regardless of server TZ
        expect(candidate.getUTCHours()).toBe(10);
        expect(candidate.getUTCMinutes()).toBe(0);
    });
});
