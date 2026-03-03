import { describe, it, expect } from 'vitest';
import { parseMetric, parseViews, distributeMetrics } from './scraper_parser';

describe('Scraper Parser Logic', () => {
    describe('parseMetric', () => {
        it('handles plain numbers', () => {
            expect(parseMetric('123')).toBe(123);
            expect(parseMetric('1,234')).toBe(1234);
        });

        it('handles K suffix', () => {
            expect(parseMetric('1.2K')).toBe(1200);
            expect(parseMetric('1k')).toBe(1000);
        });

        it('handles M suffix', () => {
            expect(parseMetric('56M')).toBe(56000000);
            expect(parseMetric('1.5m')).toBe(1500000);
        });

        it('extracts number from aria-label strings', () => {
            expect(parseMetric('123 likes')).toBe(123);
            expect(parseMetric('1.2K views')).toBe(1200);
            expect(parseMetric('讚：1,234')).toBe(1234);
        });

        it('returns 0 for invalid input', () => {
            expect(parseMetric('')).toBe(0);
            expect(parseMetric('no numbers here')).toBe(0);
        });
    });

    describe('parseViews', () => {
        it('finds views in text', () => {
            expect(parseViews('Some content\n56M views\nMore lines')).toBe(56000000);
            expect(parseViews('123次查看')).toBe(123);
        });

        it('returns 0 if not found', () => {
            expect(parseViews('just some text')).toBe(0);
        });
    });

    describe('distributeMetrics', () => {
        it('distributes when views are known', () => {
            const metrics = ["1.2K", "50", "10"];
            const res = distributeMetrics(metrics, 1200);
            expect(res.views).toBe(1200);
            expect(res.likes).toBe(50);
            expect(res.replies).toBe(10);
        });

        it('guesses views if 4 metrics are present', () => {
            const metrics = ["10K", "500", "50", "5"];
            const res = distributeMetrics(metrics);
            expect(res.views).toBe(10000);
            expect(res.likes).toBe(500);
            expect(res.replies).toBe(50);
            expect(res.reposts).toBe(5);
        });

        it('assumes likes/replies if 2 metrics present', () => {
            const metrics = ["500", "50"];
            const res = distributeMetrics(metrics);
            expect(res.views).toBe(0);
            expect(res.likes).toBe(500);
            expect(res.replies).toBe(50);
        });

        it('performs sanity swap for high likes with 0 views', () => {
            const metrics = ["10M"];
            const res = distributeMetrics(metrics);
            expect(res.views).toBe(10000000);
            expect(res.likes).toBe(0);
        });
    });
});
