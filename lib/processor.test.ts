import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from './prisma';
import { calculateHotScore, isLikelySpam, processPost, WorkspaceSettings, RejectionReason } from './processor';

// ─── Extend the global prisma mock with post.create ─────────────────────────

const mockPrisma = vi.mocked(prisma, true);

// Add `create` to the post mock (vitest.setup.ts only defines findUnique/update/delete)
(mockPrisma.post as any).create = vi.fn();

// ─── calculateHotScore (pure function) ──────────────────────────────────────

describe('calculateHotScore', () => {
    describe('breakout ratio path (views > 0 && followerCount > 0)', () => {
        it('computes breakoutRatio × 100 × decayFactor', () => {
            // 2000 views / 500 followers = 4.0 → baseScore = 400
            // No postedAt → no decay → 400
            const score = calculateHotScore({
                views: 2000, likes: 10, replies: 5, reposts: 2,
                followerCount: 500,
            });
            expect(score).toBe(400);
        });

        it('applies 72h half-life decay', () => {
            const now = new Date();
            const postedAt = new Date(now.getTime() - 72 * 3600_000); // 72h ago
            const score = calculateHotScore({
                views: 2000, likes: 10, replies: 5, reposts: 2,
                followerCount: 500, postedAt,
            });
            // baseScore=400, decayFactor = 0.5^(72/72) = 0.5
            expect(score).toBeCloseTo(200, 0);
        });

        it('ignores likes/replies/reposts when breakout ratio is used', () => {
            const a = calculateHotScore({ views: 1000, likes: 0, replies: 0, reposts: 0, followerCount: 100 });
            const b = calculateHotScore({ views: 1000, likes: 999, replies: 999, reposts: 999, followerCount: 100 });
            // Both use breakout ratio: 1000/100 × 100 = 1000
            expect(a).toBe(b);
        });
    });

    describe('legacy fallback (views === 0 or followerCount === 0)', () => {
        it('uses likes×1.5 + replies×2 + reposts×1 when views=0', () => {
            const score = calculateHotScore({
                views: 0, likes: 10, replies: 5, reposts: 3,
            });
            // 10×1.5 + 5×2 + 3×1 = 15 + 10 + 3 = 28
            expect(score).toBe(28);
        });

        it('uses legacy when followerCount=0', () => {
            const score = calculateHotScore({
                views: 5000, likes: 10, replies: 5, reposts: 3,
                followerCount: 0,
            });
            expect(score).toBe(28);
        });

        it('uses legacy when followerCount undefined', () => {
            const score = calculateHotScore({
                views: 5000, likes: 10, replies: 5, reposts: 3,
            });
            expect(score).toBe(28);
        });
    });

    describe('decay and edge cases', () => {
        it('no postedAt → returns baseScore without decay', () => {
            const score = calculateHotScore({ views: 0, likes: 10, replies: 0, reposts: 0 });
            expect(score).toBe(15); // 10 × 1.5
        });

        it('NaN guard → returns baseScore', () => {
            // postedAt = invalid date → safeDate returns undefined → no decay
            const score = calculateHotScore({
                views: 0, likes: 10, replies: 0, reposts: 0,
                postedAt: new Date('invalid'),
            });
            expect(score).toBe(15);
        });

        it('zero everything → score = 0', () => {
            const score = calculateHotScore({ views: 0, likes: 0, replies: 0, reposts: 0 });
            expect(score).toBe(0);
        });
    });
});

// ─── isLikelySpam ───────────────────────────────────────────────────────────

describe('isLikelySpam', () => {
    it('null content → spam', () => {
        expect(isLikelySpam({ content: null, followerCount: 1000 })).toBe(true);
    });

    it('"link in bio" pattern → spam', () => {
        expect(isLikelySpam({ content: 'Check my link in bio for deals', followerCount: 5000 })).toBe(true);
    });

    it('"follow for follow" pattern → spam', () => {
        expect(isLikelySpam({ content: 'follow for follow back always', followerCount: 100 })).toBe(true);
    });

    it('"check out my bio" pattern → spam', () => {
        expect(isLikelySpam({ content: 'Check out my bio for more info', followerCount: 500 })).toBe(true);
    });

    it('"dm for collab" pattern → spam', () => {
        expect(isLikelySpam({ content: 'dm for collab opportunities', followerCount: 200 })).toBe(true);
    });

    it('emoji combo spam pattern → spam', () => {
        expect(isLikelySpam({ content: 'Big news coming 🔥💰🚀 stay tuned', followerCount: 100 })).toBe(true);
    });

    it('short content (<20 chars) + zero followers → spam', () => {
        expect(isLikelySpam({ content: 'hey look at this', followerCount: 0 })).toBe(true);
    });

    it('short content + null followers → spam', () => {
        expect(isLikelySpam({ content: 'nice post', followerCount: null })).toBe(true);
    });

    it('short content + has followers → NOT spam', () => {
        expect(isLikelySpam({ content: 'great thread!', followerCount: 500 })).toBe(false);
    });

    it('normal content + followers → NOT spam', () => {
        expect(isLikelySpam({ content: 'This is a thoughtful analysis of the current market trends in tech.', followerCount: 1000 })).toBe(false);
    });

    it('normal length content + zero followers → NOT spam (passes length check)', () => {
        expect(isLikelySpam({ content: 'This is a normal post with enough characters', followerCount: 0 })).toBe(false);
    });
});

// ─── processPost gating integration ─────────────────────────────────────────

describe('processPost', () => {
    const defaultSettings: WorkspaceSettings = {
        translationPrompt: 'Translate to English',
        hotScoreThreshold: 10,
        maxPostAgeHours: 48,
    };

    const makePost = (overrides: Record<string, any> = {}) => ({
        threadId: 'test-thread-1',
        content: 'This is a meaningful post about technology and innovation trends',
        mediaUrls: [],
        views: 5000,
        likes: 50,
        replies: 10,
        reposts: 5,
        postedAt: new Date(Date.now() - 2 * 3600_000), // 2h ago
        postUrl: 'https://threads.net/@user/post/123',
        externalUrls: [],
        ...overrides,
    });

    beforeEach(() => {
        vi.clearAllMocks();
        // Default: post doesn't exist
        (mockPrisma.post.findUnique as any).mockResolvedValue(null);
        // Default: create returns the saved post
        (mockPrisma.post as any).create.mockImplementation(({ data }: any) => Promise.resolve({
            id: 'new-post-id',
            ...data,
        }));
    });

    // ── ACCOUNT freshness gate ───────────────────────────────────────────────

    describe('ACCOUNT freshness gate', () => {
        it('post older than maxPostAgeHours → rejected with freshness reason', async () => {
            const oldPost = makePost({
                postedAt: new Date(Date.now() - 50 * 3600_000), // 50h ago
            });
            const result = await processPost(
                oldPost, 'testuser', 'ws-1', defaultSettings, {},
                1000, { type: 'ACCOUNT' }
            );
            expect(result).toEqual({ rejected: 'freshness' });
            expect(mockPrisma.post.findUnique).not.toHaveBeenCalled();
        });

        it('post within maxPostAgeHours → passes freshness', async () => {
            const freshPost = makePost({
                postedAt: new Date(Date.now() - 24 * 3600_000), // 24h ago
            });
            const result = await processPost(
                freshPost, 'testuser', 'ws-1', defaultSettings, {},
                1000, { type: 'ACCOUNT' }
            );
            // Should proceed past freshness (findUnique is called)
            expect(mockPrisma.post.findUnique).toHaveBeenCalled();
        });
    });

    // ── TOPIC freshness gate ─────────────────────────────────────────────────

    describe('TOPIC freshness gate', () => {
        it('post >72h → hard rejected with freshness reason', async () => {
            const oldPost = makePost({
                postedAt: new Date(Date.now() - 73 * 3600_000),
            });
            const result = await processPost(
                oldPost, 'topic_tech', 'ws-1', defaultSettings, {},
                5000, { type: 'TOPIC' }
            );
            expect(result).toEqual({ rejected: 'freshness' });
            expect(mockPrisma.post.findUnique).not.toHaveBeenCalled();
        });

        it('post within 72h → passes to scoring', async () => {
            const freshPost = makePost({
                postedAt: new Date(Date.now() - 6 * 3600_000),
                likes: 100, replies: 20, reposts: 10,
            });
            const result = await processPost(
                freshPost, 'topic_tech', 'ws-1', defaultSettings, {},
                5000, { type: 'TOPIC' }
            );
            // Should proceed past freshness (findUnique is called)
            expect(mockPrisma.post.findUnique).toHaveBeenCalled();
        });
    });

    // ── Undefined postedAt edge case ─────────────────────────────────────────

    describe('undefined postedAt edge case (FIXED)', () => {
        it('postedAt undefined → rejected with no_date reason', async () => {
            const noDatePost = makePost({
                postedAt: undefined,
                likes: 100, replies: 20, reposts: 10,
            });
            const result = await processPost(
                noDatePost, 'testuser', 'ws-1', defaultSettings, {},
                1000, { type: 'ACCOUNT' }
            );
            // Previously bypassed freshness gate (ageHours=0). Now rejected early.
            expect(result).toEqual({ rejected: 'no_date' });
            expect(mockPrisma.post.findUnique).not.toHaveBeenCalled();
        });
    });

    // ── Duplicate detection ──────────────────────────────────────────────────

    describe('duplicate detection', () => {
        it('duplicate post → returns { rejected: duplicate } after updating engagement', async () => {
            (mockPrisma.post.findUnique as any).mockResolvedValue({
                id: 'existing-id',
                threadId: 'test-thread-1',
            });
            (mockPrisma.post.update as any).mockResolvedValue({});

            const result = await processPost(
                makePost(), 'testuser', 'ws-1', defaultSettings, {},
                1000, { type: 'ACCOUNT' }
            );
            expect(result).toEqual({ rejected: 'duplicate' });
            expect(mockPrisma.post.update).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { id: 'existing-id' },
                    data: expect.objectContaining({
                        likes: 50,
                        replies: 10,
                        reposts: 5,
                    }),
                })
            );
        });
    });

    // ── Hot score gate (ACCOUNT) ─────────────────────────────────────────────

    describe('hot score gate (ACCOUNT)', () => {
        it('score below threshold → rejected with engagement reason', async () => {
            // Very low engagement, no views, no followers → legacy fallback
            // likes=1×1.5 + replies=0 + reposts=0 = 1.5 < threshold 10
            const lowPost = makePost({
                views: 0, likes: 1, replies: 0, reposts: 0,
            });
            const result = await processPost(
                lowPost, 'testuser', 'ws-1', defaultSettings, {},
                0, { type: 'ACCOUNT' }
            );
            expect(result).toEqual({ rejected: 'engagement' });
        });

        it('score above threshold → saved', async () => {
            // views=5000, followerCount=500 → breakout ratio = 10 → score = 1000
            const hotPost = makePost({
                views: 5000, likes: 50, replies: 10, reposts: 5,
            });
            const result = await processPost(
                hotPost, 'testuser', 'ws-1', defaultSettings, {},
                500, { type: 'ACCOUNT' }
            );
            expect(result).toBeDefined();
            expect((mockPrisma.post as any).create).toHaveBeenCalled();
        });
    });

    // ── Topic scoring ────────────────────────────────────────────────────────

    describe('topic scoring', () => {
        it('UNKNOWN tier, low engagement → rejected with engagement reason', async () => {
            // 5 likes, 0 replies, 0 reposts → rawEngagement=5, tier=UNKNOWN, gate=25
            // 5 < 25 → rejected
            const lowPost = makePost({
                likes: 5, replies: 0, reposts: 0, views: 100,
            });
            const result = await processPost(
                lowPost, 'topic_tech', 'ws-1', defaultSettings, {},
                0, { type: 'TOPIC' }
            );
            expect(result).toEqual({ rejected: 'engagement' });
        });

        it('ESTABLISHED tier, high engagement → accepted', async () => {
            // 200 likes, 50 replies, 20 reposts, followerCount=10000
            // rawEngagement = 200 + 50×3 + 20×2 + 0 = 200+150+40 = 390
            // At ~2h, decayFactor ≈ 0.97, decayedEngagement ≈ 378
            // breakoutRatio = 390/10000 = 0.039
            // blended = 378 × 0.4 + 0.039 × 1000 × 0.6 = 151.2 + 23.4 = 174.6
            const hotPost = makePost({
                likes: 200, replies: 50, reposts: 20, views: 50000,
                postedAt: new Date(Date.now() - 2 * 3600_000),
            });
            const result = await processPost(
                hotPost, 'topic_tech', 'ws-1', defaultSettings, {},
                10000, { type: 'TOPIC' }
            );
            expect(result).toBeDefined();
            expect((mockPrisma.post as any).create).toHaveBeenCalled();
        });
    });

    // ── Spam filter (TOPIC) ──────────────────────────────────────────────────

    describe('spam filter (TOPIC)', () => {
        it('"link in bio" content → rejected with spam reason', async () => {
            const spamPost = makePost({
                content: 'Check my link in bio for amazing deals!',
                likes: 500, replies: 100, reposts: 50,
            });
            const result = await processPost(
                spamPost, 'topic_tech', 'ws-1', defaultSettings, {},
                10000, { type: 'TOPIC' }
            );
            expect(result).toEqual({ rejected: 'spam' });
        });

        it('null content → rejected as spam', async () => {
            const noContentPost = makePost({
                content: null as any,
                likes: 500, replies: 100, reposts: 50,
            });
            const result = await processPost(
                noContentPost, 'topic_tech', 'ws-1', defaultSettings, {},
                10000, { type: 'TOPIC' }
            );
            expect(result).toEqual({ rejected: 'spam' });
        });
    });
});
