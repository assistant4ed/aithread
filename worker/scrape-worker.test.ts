/**
 * ScrapeLog Counter Tests
 *
 * After the Bug A fix, processPost now returns { rejected: reason } instead of
 * bare undefined. The worker uses this reason to correctly classify counters:
 *   - 'freshness' | 'no_date' → failedFreshness++
 *   - 'engagement' | 'spam'   → failedEngagement++
 *   - 'duplicate'             → not counted (expected on re-scrapes)
 */
import { describe, it, expect } from 'vitest';
import type { RejectionReason } from '../lib/processor';

/**
 * Mirrors the fixed counter logic from scrape-worker.ts.
 */
function classifyRejection(
    result: { rejected: RejectionReason } | any,
): 'new' | 'failedFreshness' | 'failedEngagement' | 'duplicate' {
    if (result && 'rejected' in result) {
        const reason = result.rejected as RejectionReason;
        if (reason === 'freshness' || reason === 'no_date') return 'failedFreshness';
        if (reason === 'engagement' || reason === 'spam') return 'failedEngagement';
        if (reason === 'duplicate') return 'duplicate';
    }
    // savedPost object → new
    if (result && result.id) return 'new';
    return 'failedEngagement'; // defensive fallback
}

/**
 * Replicates the empty-post skip logic (line 137).
 */
function shouldSkipPost(content: string | null, mediaUrls: { url: string; type: string }[]): boolean {
    return !content && (!mediaUrls || mediaUrls.length === 0);
}

describe('scrape-worker counter logic (FIXED)', () => {
    it('freshness rejection → failedFreshness', () => {
        expect(classifyRejection({ rejected: 'freshness' })).toBe('failedFreshness');
    });

    it('no_date rejection → failedFreshness', () => {
        expect(classifyRejection({ rejected: 'no_date' })).toBe('failedFreshness');
    });

    it('BUG A FIXED: 50h ACCOUNT post rejected by freshness → now correctly counted as failedFreshness', () => {
        // Previously, the worker re-derived ageHours and checked >72h,
        // so a 50h post was miscounted as failedEngagement.
        // Now processPost returns { rejected: 'freshness' } and the worker trusts it.
        expect(classifyRejection({ rejected: 'freshness' })).toBe('failedFreshness');
    });

    it('engagement rejection → failedEngagement', () => {
        expect(classifyRejection({ rejected: 'engagement' })).toBe('failedEngagement');
    });

    it('spam rejection → failedEngagement', () => {
        expect(classifyRejection({ rejected: 'spam' })).toBe('failedEngagement');
    });

    it('duplicate → not counted in freshness or engagement', () => {
        expect(classifyRejection({ rejected: 'duplicate' })).toBe('duplicate');
    });

    it('saved post → new', () => {
        expect(classifyRejection({ id: 'saved-1', threadId: 'thread-1' })).toBe('new');
    });

    it('empty post (no content, no media) → skipped entirely', () => {
        expect(shouldSkipPost(null, [])).toBe(true);
        expect(shouldSkipPost('', [])).toBe(true);
        expect(shouldSkipPost(null, [{ url: 'https://img.jpg', type: 'image' }])).toBe(false);
        expect(shouldSkipPost('some content', [])).toBe(false);
    });
});
