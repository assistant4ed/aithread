/**
 * Metric extraction helpers for Threads scraper.
 *
 * Extracted into a standalone module so the logic can be:
 *   1. Unit-tested without Puppeteer
 *   2. Reused across scrapeAccount / scrapeTopic evaluate callbacks
 *
 * NOTE: These functions are also inlined inside page.evaluate() because
 * evaluate runs in browser context and cannot import Node modules.
 * Keep this file in sync with the inline copies in scraper.ts.
 */

export interface ParsedMetrics {
    views: number;
    likes: number;
    replies: number;
    reposts: number;
}

/** Parse a single metric string like "56M", "1.2K", "340" into a number. */
export function parseMetric(s: string): number {
    const m = s.match(/(\d+(\.\d+)?)/);
    if (!m) return 0;
    let n = parseFloat(m[1]);
    if (s.toUpperCase().includes('K')) n *= 1000;
    if (s.toUpperCase().includes('M')) n *= 1000000;
    return n;
}

/** Try to extract views from text like "56M views" or "1,234 次查看". */
export function extractViewsFromText(text: string): number {
    const viewTextMatch = text.match(/(\d[\d,\.]*[KkMm]?)\s*(?:views?|次查看|播放|浏览)/i);
    if (!viewTextMatch) return 0;
    let n = parseFloat(viewTextMatch[1].replace(/,/g, ''));
    if (viewTextMatch[1].toUpperCase().includes('K')) n *= 1000;
    if (viewTextMatch[1].toUpperCase().includes('M')) n *= 1000000;
    return isNaN(n) ? 0 : n;
}

/** Filter innerText lines down to those that look like bare metric values. */
export function extractMetricLines(innerText: string): string[] {
    const lines = innerText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
    return lines.filter(l => /^\d+(\.\d+)?[KM]?(\s|$)/i.test(l)).slice(0, 5);
}

/**
 * Given aria-label-extracted values and the raw innerText of a post element,
 * run the full metric extraction pipeline:
 *   1. Views text fallback (if aria-label missed views)
 *   2. Text-based positional fallback (if aria-labels missed engagement)
 *   3. Sanity swap (if likes > 5M and views === 0)
 */
export function resolveMetrics(
    ariaValues: ParsedMetrics,
    innerText: string,
): ParsedMetrics {
    let { views, likes, replies, reposts } = ariaValues;

    // Step 1: Views text fallback
    if (views === 0) {
        views = extractViewsFromText(innerText);
    }

    // Step 2: Text-based positional fallback (only when aria-labels missed ALL engagement)
    if (likes === 0 && replies === 0 && reposts === 0) {
        const metrics = extractMetricLines(innerText);

        if (views > 0) {
            // Views captured — filter out that metric line, rest are engagement
            const engMetrics = metrics.filter(s => Math.abs(parseMetric(s) - views) > 1);
            if (engMetrics.length >= 1) likes = parseMetric(engMetrics[0]);
            if (engMetrics.length >= 2) replies = parseMetric(engMetrics[1]);
            if (engMetrics.length >= 3) reposts = parseMetric(engMetrics[2]);
        } else if (metrics.length >= 4) {
            // 4+ bare metrics: first is typically views on Threads
            views = parseMetric(metrics[0]);
            likes = parseMetric(metrics[1]);
            replies = parseMetric(metrics[2]);
            reposts = parseMetric(metrics[3]);
        } else {
            // 3 or fewer: assume likes, replies, reposts
            if (metrics.length >= 1) likes = parseMetric(metrics[0]);
            if (metrics.length >= 2) replies = parseMetric(metrics[1]);
            if (metrics.length >= 3) reposts = parseMetric(metrics[2]);
        }
    }

    // Step 3: Sanity check — no Threads post realistically gets 5M+ likes
    if (likes > 5_000_000 && views === 0) {
        views = likes;
        likes = 0;
    }

    return { views, likes, replies, reposts };
}
