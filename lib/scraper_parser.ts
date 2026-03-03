/**
 * Pure functions for parsing Threads.net DOM strings and metrics.
 * These are extracted to be unit-testable without a browser context.
 */

/**
 * Parses a metric string (e.g., "1.2K", "56M", "1,234") into a number.
 */
export function parseMetric(s: string): number {
    if (!s) return 0;
    // Match number and optional K/M suffix (separated by optional space)
    const m = s.match(/(\d[\d,\.]*)\s*([KkMm])?(?![a-zA-Z])/);
    if (!m) return 0;

    let n = parseFloat(m[1].replace(/,/g, ''));
    if (m[2]) {
        const suffix = m[2].toUpperCase();
        if (suffix === 'K') n *= 1000;
        if (suffix === 'M') n *= 1000000;
    }

    return isNaN(n) ? 0 : n;
}

/**
 * Parses a "views" string which might be plain text like "56M views".
 */
export function parseViews(innerText: string): number {
    const viewTextMatch = innerText.match(/(\d[\d,\.]*[KkMm]?)\s*(?:views?|次查看|播放|浏览)/i);
    if (viewTextMatch) {
        return parseMetric(viewTextMatch[1]);
    }
    return 0;
}

/**
 * Given a list of lines that look like metrics (e.g. ["123", "1.2K"]),
 * and optionally a known views count, assigns them to likes, replies, and reposts.
 */
export function distributeMetrics(metrics: string[], views: number = 0): { views: number, likes: number, replies: number, reposts: number } {
    const results = { views, likes: 0, replies: 0, reposts: 0 };
    const parsed = metrics.map(m => parseMetric(m));

    if (views > 0) {
        // Filter out the value that matches views (to avoid double counting)
        const engMetrics = parsed.filter(v => Math.abs(v - views) > 1);
        if (engMetrics.length >= 1) results.likes = engMetrics[0];
        if (engMetrics.length >= 2) results.replies = engMetrics[1];
        if (engMetrics.length >= 3) results.reposts = engMetrics[2];
    } else if (parsed.length >= 4) {
        // 4+ metrics: first is typically views on Threads
        results.views = parsed[0];
        results.likes = parsed[1];
        results.replies = parsed[2];
        results.reposts = parsed[3];
    } else {
        // 3 or fewer: assume likes, replies, reposts
        if (parsed.length >= 1) results.likes = parsed[0];
        if (parsed.length >= 2) results.replies = parsed[1];
        if (parsed.length >= 3) results.reposts = parsed[2];
    }

    // Sanity: if likes is implausibly high and views is 0, they might be swapped
    if (results.likes > 5000000 && results.views === 0) {
        results.views = results.likes;
        results.likes = 0;
    }

    return results;
}
