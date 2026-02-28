import { describe, it, expect } from 'vitest';
import { calculateTopicScore, applyFreshnessAdjustment } from './topicScore';

// ─── calculateTopicScore ────────────────────────────────────────────────────

describe('calculateTopicScore', () => {
    // Helper: build default input, override as needed
    const input = (overrides: Partial<Parameters<typeof calculateTopicScore>[0]> = {}) => ({
        likeCount: 0,
        replyCount: 0,
        repostCount: 0,
        quoteCount: 0,
        followerCount: null as number | null,
        ageHours: 0,
        ...overrides,
    });

    // ── Tier classification ──────────────────────────────────────────────────

    describe('tier classification', () => {
        it('null followers → UNKNOWN', () => {
            const result = calculateTopicScore(input({ followerCount: null, likeCount: 50 }));
            expect(result.tier).toBe('UNKNOWN');
        });

        it('0 followers → UNKNOWN', () => {
            const result = calculateTopicScore(input({ followerCount: 0, likeCount: 50 }));
            expect(result.tier).toBe('UNKNOWN');
        });

        it('500 followers → EMERGING', () => {
            const result = calculateTopicScore(input({ followerCount: 500, likeCount: 50 }));
            expect(result.tier).toBe('EMERGING');
        });

        it('4999 followers → EMERGING', () => {
            const result = calculateTopicScore(input({ followerCount: 4999, likeCount: 50 }));
            expect(result.tier).toBe('EMERGING');
        });

        it('5000 followers → ESTABLISHED', () => {
            const result = calculateTopicScore(input({ followerCount: 5000, likeCount: 50 }));
            expect(result.tier).toBe('ESTABLISHED');
        });

        it('50000 followers → ESTABLISHED', () => {
            const result = calculateTopicScore(input({ followerCount: 50000, likeCount: 50 }));
            expect(result.tier).toBe('ESTABLISHED');
        });
    });

    // ── Scoring formulas ─────────────────────────────────────────────────────

    describe('scoring formulas', () => {
        it('ESTABLISHED uses blended scoring (decayedEngagement × 0.4 + breakoutRatio × 1000 × 0.6)', () => {
            // 10 likes + 5 replies×3 + 2 reposts×2 + 1 quote×2 = 10+15+4+2 = 31
            // At ageHours=0, decayFactor=1, so decayedEngagement=31
            // breakoutRatio = 31 / 10000 = 0.0031
            // blended = 31 × 0.4 + 0.0031 × 1000 × 0.6 = 12.4 + 1.86 = 14.26
            const result = calculateTopicScore(input({
                followerCount: 10000,
                likeCount: 10,
                replyCount: 5,
                repostCount: 2,
                quoteCount: 1,
                ageHours: 0,
            }));
            expect(result.tier).toBe('ESTABLISHED');
            expect(result.score).toBeCloseTo(14.26, 1);
        });

        it('EMERGING uses pure decayedEngagement', () => {
            // 20 likes + 3 replies×3 + 1 repost×2 = 20+9+2 = 31
            const result = calculateTopicScore(input({
                followerCount: 1000,
                likeCount: 20,
                replyCount: 3,
                repostCount: 1,
                ageHours: 0,
            }));
            expect(result.tier).toBe('EMERGING');
            expect(result.score).toBe(31);
        });

        it('UNKNOWN uses pure decayedEngagement', () => {
            const result = calculateTopicScore(input({
                followerCount: null,
                likeCount: 30,
                replyCount: 0,
                repostCount: 0,
                ageHours: 0,
            }));
            expect(result.tier).toBe('UNKNOWN');
            expect(result.score).toBe(30);
        });
    });

    // ── Gate thresholds ──────────────────────────────────────────────────────

    describe('gate thresholds', () => {
        it('ESTABLISHED gate: score >= 8 passes', () => {
            // Need blendedScore >= 8
            // 100 likes at 10000 followers: rawEngagement=100, decayedEngagement=100
            // breakoutRatio = 100/10000 = 0.01
            // blended = 100 × 0.4 + 0.01 × 1000 × 0.6 = 40 + 6 = 46
            const result = calculateTopicScore(input({
                followerCount: 10000, likeCount: 100, ageHours: 0,
            }));
            expect(result.passesGate).toBe(true);
        });

        it('ESTABLISHED gate: very low engagement fails', () => {
            // 1 like at 10000 followers: rawEngagement=1, decayedEngagement=1
            // breakoutRatio = 1/10000 = 0.0001
            // blended = 1 × 0.4 + 0.0001 × 1000 × 0.6 = 0.4 + 0.06 = 0.46
            const result = calculateTopicScore(input({
                followerCount: 10000, likeCount: 1, ageHours: 0,
            }));
            expect(result.score).toBeCloseTo(0.46, 1);
            expect(result.passesGate).toBe(false);
        });

        it('EMERGING gate: score >= 15 passes', () => {
            const result = calculateTopicScore(input({
                followerCount: 1000, likeCount: 15, ageHours: 0,
            }));
            expect(result.score).toBe(15);
            expect(result.passesGate).toBe(true);
        });

        it('EMERGING gate: score < 15 fails', () => {
            const result = calculateTopicScore(input({
                followerCount: 1000, likeCount: 14, ageHours: 0,
            }));
            expect(result.score).toBe(14);
            expect(result.passesGate).toBe(false);
        });

        it('UNKNOWN gate: score >= 25 passes', () => {
            const result = calculateTopicScore(input({
                followerCount: null, likeCount: 25, ageHours: 0,
            }));
            expect(result.score).toBe(25);
            expect(result.passesGate).toBe(true);
        });

        it('UNKNOWN gate: score < 25 fails', () => {
            const result = calculateTopicScore(input({
                followerCount: null, likeCount: 24, ageHours: 0,
            }));
            expect(result.score).toBe(24);
            expect(result.passesGate).toBe(false);
        });
    });

    // ── Time decay ───────────────────────────────────────────────────────────

    describe('time decay (48h half-life)', () => {
        it('0h → no decay (factor = 1.0)', () => {
            const result = calculateTopicScore(input({
                followerCount: null, likeCount: 100, ageHours: 0,
            }));
            expect(result.score).toBe(100);
        });

        it('48h → score × 0.5', () => {
            const result = calculateTopicScore(input({
                followerCount: null, likeCount: 100, ageHours: 48,
            }));
            expect(result.score).toBeCloseTo(50, 0);
        });

        it('96h → score × 0.25', () => {
            const result = calculateTopicScore(input({
                followerCount: null, likeCount: 100, ageHours: 96,
            }));
            expect(result.score).toBeCloseTo(25, 0);
        });
    });

    // ── Edge cases ───────────────────────────────────────────────────────────

    describe('edge cases', () => {
        it('zero engagement → score = 0, passesGate = false', () => {
            const result = calculateTopicScore(input({
                followerCount: null, likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0,
            }));
            expect(result.score).toBe(0);
            expect(result.passesGate).toBe(false);
        });

        it('zero engagement ESTABLISHED → score = 0, passesGate = false', () => {
            const result = calculateTopicScore(input({
                followerCount: 10000, likeCount: 0, replyCount: 0, repostCount: 0, quoteCount: 0,
            }));
            expect(result.score).toBe(0);
            expect(result.passesGate).toBe(false);
        });
    });
});

// ─── applyFreshnessAdjustment ───────────────────────────────────────────────

describe('applyFreshnessAdjustment', () => {
    const baseScore = 100;

    // Note: After Bug B fix, this function only handles TOPIC sliding windows.
    // ACCOUNT freshness is handled upstream in processPost at maxPostAgeHours.

    describe('sliding windows', () => {
        it('≤6h → ×1.0 (no penalty)', () => {
            expect(applyFreshnessAdjustment(baseScore, 3)).toBe(100);
        });

        it('≤24h → ×0.75', () => {
            expect(applyFreshnessAdjustment(baseScore, 12)).toBe(75);
        });

        it('≤48h → ×0.45', () => {
            expect(applyFreshnessAdjustment(baseScore, 36)).toBe(45);
        });

        it('≤72h → ×0.2', () => {
            expect(applyFreshnessAdjustment(baseScore, 60)).toBe(20);
        });

        it('>72h → 0 (hard cutoff)', () => {
            expect(applyFreshnessAdjustment(baseScore, 73)).toBe(0);
        });
    });

    describe('boundary tests', () => {
        it('exactly 6h → ×1.0 (≤6h window)', () => {
            expect(applyFreshnessAdjustment(baseScore, 6)).toBe(100);
        });

        it('6.001h → ×0.75 (falls into ≤24h window)', () => {
            expect(applyFreshnessAdjustment(baseScore, 6.001)).toBe(75);
        });

        it('exactly 24h → ×0.75', () => {
            expect(applyFreshnessAdjustment(baseScore, 24)).toBe(75);
        });

        it('24.001h → ×0.45', () => {
            expect(applyFreshnessAdjustment(baseScore, 24.001)).toBe(45);
        });

        it('exactly 48h → ×0.45', () => {
            expect(applyFreshnessAdjustment(baseScore, 48)).toBe(45);
        });

        it('48.001h → ×0.2', () => {
            expect(applyFreshnessAdjustment(baseScore, 48.001)).toBe(20);
        });

        it('exactly 72h → ×0.2', () => {
            expect(applyFreshnessAdjustment(baseScore, 72)).toBe(20);
        });

        it('72.001h → 0', () => {
            expect(applyFreshnessAdjustment(baseScore, 72.001)).toBe(0);
        });
    });
});
