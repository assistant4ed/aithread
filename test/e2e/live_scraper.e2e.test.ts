import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ThreadsScraper } from '@/lib/scraper';

describe('ThreadsScraper E2E (Live Site)', () => {
    let scraper: ThreadsScraper;

    beforeAll(async () => {
        scraper = new ThreadsScraper();
        await scraper.init();
    });

    afterAll(async () => {
        await scraper.close();
    });

    it('can scrape at least one post from a known live account', async () => {
        // Mark Zuckerberg is a good target for a public profile
        const results = await scraper.scrapeAccount('zuck');

        console.log(`[E2E] Scraped ${results.length} posts from @zuck`);

        // We expect at least one post to be found if the selectors are working
        expect(results.length).toBeGreaterThan(0);

        const firstPost = results[0];
        expect(firstPost.authorUsername).toBe('zuck');
        expect(firstPost.threadId).toBeDefined();
        expect(firstPost.content || firstPost.mediaUrls.length > 0).toBeTruthy();
    }, 60000); // 60s timeout for live network
});
