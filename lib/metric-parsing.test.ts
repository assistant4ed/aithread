import { describe, it, expect } from 'vitest';
import {
    parseMetric,
    extractViewsFromText,
    extractMetricLines,
    resolveMetrics,
} from './metric-parsing';

// ─── parseMetric ────────────────────────────────────────────────────────────

describe('parseMetric', () => {
    it('parses plain integers', () => {
        expect(parseMetric('340')).toBe(340);
        expect(parseMetric('0')).toBe(0);
        expect(parseMetric('1')).toBe(1);
    });

    it('parses K suffix', () => {
        expect(parseMetric('1.2K')).toBe(1200);
        expect(parseMetric('56K')).toBe(56000);
    });

    it('parses M suffix', () => {
        expect(parseMetric('56M')).toBe(56000000);
        expect(parseMetric('1.5M')).toBe(1500000);
    });

    it('returns 0 for non-numeric strings', () => {
        expect(parseMetric('hello')).toBe(0);
        expect(parseMetric('')).toBe(0);
    });
});

// ─── extractViewsFromText ───────────────────────────────────────────────────

describe('extractViewsFromText', () => {
    it('extracts "56M views"', () => {
        expect(extractViewsFromText('Some content\n56M views\nMore text')).toBe(56000000);
    });

    it('extracts "1,234 views"', () => {
        expect(extractViewsFromText('1,234 views')).toBe(1234);
    });

    it('extracts "12K views"', () => {
        expect(extractViewsFromText('Post text here\n12K views')).toBe(12000);
    });

    it('extracts singular "view"', () => {
        expect(extractViewsFromText('1 view')).toBe(1);
    });

    it('extracts Chinese view patterns', () => {
        expect(extractViewsFromText('56M 次查看')).toBe(56000000);
        expect(extractViewsFromText('1.2K 播放')).toBe(1200);
        expect(extractViewsFromText('340 浏览')).toBe(340);
    });

    it('returns 0 when no view pattern found', () => {
        expect(extractViewsFromText('just some random text')).toBe(0);
        expect(extractViewsFromText('56M likes')).toBe(0);
    });
});

// ─── extractMetricLines ─────────────────────────────────────────────────────

describe('extractMetricLines', () => {
    it('extracts lines starting with numbers', () => {
        const text = 'username\nSome post text\n56M\n1.2K\n36\n5\nmore text';
        const result = extractMetricLines(text);
        expect(result).toEqual(['56M', '1.2K', '36', '5']);
    });

    it('limits to 5 metric lines', () => {
        const text = '1\n2\n3\n4\n5\n6\n7';
        const result = extractMetricLines(text);
        expect(result).toHaveLength(5);
    });

    it('ignores lines not starting with digits', () => {
        const text = 'hello\nworld\n@username\n42\n#hashtag';
        const result = extractMetricLines(text);
        expect(result).toEqual(['42']);
    });
});

// ─── resolveMetrics ─────────────────────────────────────────────────────────

describe('resolveMetrics', () => {
    describe('Bug 1: views counted as likes (Singapore locale)', () => {
        it('correctly handles "56M views" text when aria-labels all fail', () => {
            // Simulates: aria-labels failed for ALL metrics, innerText has "56M views"
            // followed by bare numbers for engagement
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                'username\nPost content here\n56M views\n1.2K\n36\n5',
            );
            expect(result.views).toBe(56000000);
            expect(result.likes).toBe(1200);
            expect(result.replies).toBe(36);
            expect(result.reposts).toBe(5);
        });

        it('uses 4-metric positional when no "views" text exists', () => {
            // Bare numbers with no textual "views" label — 4 numbers = views/likes/replies/reposts
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                'username\nSome text\n56M\n1.2K\n36\n5',
            );
            expect(result.views).toBe(56000000);
            expect(result.likes).toBe(1200);
            expect(result.replies).toBe(36);
            expect(result.reposts).toBe(5);
        });

        it('sanity-swaps likes > 5M to views when views is 0', () => {
            // Edge case: only 2 metric lines, first is views misidentified as likes
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                'Post content\n56M\n36',
            );
            // With only 2 metrics and no views text: fallback assigns likes=56M, replies=36
            // Sanity check swaps likes→views since 56M > 5M
            expect(result.views).toBe(56000000);
            expect(result.likes).toBe(0);
            expect(result.replies).toBe(36);
        });

        it('does NOT swap likes ≤ 5M (legitimate viral post)', () => {
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                'Post\n4M\n200\n15',
            );
            // 4M likes is below the 5M threshold — keep as-is
            expect(result.likes).toBe(4000000);
            expect(result.views).toBe(0);
        });
    });

    describe('aria-label extraction works — no fallback needed', () => {
        it('preserves aria-label values when all are populated', () => {
            const result = resolveMetrics(
                { views: 50000, likes: 1200, replies: 36, reposts: 5 },
                'username\nIrrelevant text\n999\n888',
            );
            expect(result).toEqual({ views: 50000, likes: 1200, replies: 36, reposts: 5 });
        });

        it('fills views from text when only views aria-label is missing', () => {
            const result = resolveMetrics(
                { views: 0, likes: 1200, replies: 36, reposts: 5 },
                'Post text\n56M views',
            );
            expect(result.views).toBe(56000000);
            // Engagement unchanged — fallback didn't trigger
            expect(result.likes).toBe(1200);
            expect(result.replies).toBe(36);
            expect(result.reposts).toBe(5);
        });
    });

    describe('3-metric fallback (no views)', () => {
        it('assigns 3 bare numbers as likes/replies/reposts', () => {
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                'Post text\n340\n12\n3',
            );
            expect(result.likes).toBe(340);
            expect(result.replies).toBe(12);
            expect(result.reposts).toBe(3);
            expect(result.views).toBe(0);
        });
    });

    describe('views-aware engagement extraction', () => {
        it('filters out the views metric line when views already captured', () => {
            // "56M views" captured by text search → views=56M
            // Fallback metric lines include "56M" (the views line) plus engagement
            // The engagement assignment should skip the 56M line
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                'Post text\n56M views\n56M\n1.2K\n36\n5',
            );
            expect(result.views).toBe(56000000);
            expect(result.likes).toBe(1200);
            expect(result.replies).toBe(36);
            expect(result.reposts).toBe(5);
        });
    });

    describe('edge cases', () => {
        it('handles empty innerText', () => {
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                '',
            );
            expect(result).toEqual({ views: 0, likes: 0, replies: 0, reposts: 0 });
        });

        it('handles single metric line', () => {
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                'Post\n250',
            );
            expect(result.likes).toBe(250);
            expect(result.views).toBe(0);
        });

        it('handles Chinese views + K engagement', () => {
            const result = resolveMetrics(
                { views: 0, likes: 0, replies: 0, reposts: 0 },
                '贴文内容\n2.3M 次查看\n4.5K\n120\n30',
            );
            expect(result.views).toBe(2300000);
            expect(result.likes).toBe(4500);
            expect(result.replies).toBe(120);
            expect(result.reposts).toBe(30);
        });
    });
});
