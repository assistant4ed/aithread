import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ThreadsScraper } from './scraper';

describe('ThreadsScraper Integration (Real Browser)', () => {
    let scraper: ThreadsScraper;

    beforeAll(async () => {
        scraper = new ThreadsScraper();
        await scraper.init();
    });

    afterAll(async () => {
        await scraper.close();
    });

    it('successfully parses a mock Threads page without ReferenceError', async () => {
        const browser = (scraper as any).browser;

        browser.on('targetcreated', async (target: any) => {
            const page = await target.page();
            if (!page) return;

            await page.setRequestInterception(true);
            page.on('request', (req: any) => {
                try {
                    if (req.url().includes('threads.net/@testuser')) {
                        req.respond({
                            status: 200,
                            contentType: 'text/html',
                            body: `
                                <html>
                                    <head><meta charset="UTF-8"></head>
                                    <body>
                                        <div role="article" data-pressable="true">
                                            <a href="/@testuser">testuser</a>
                                            <a href="/@testuser/post/post123">Post Link</a>
                                            <span>This is a test post content</span>
                                            <time datetime="2026-03-01T12:00:00.000Z"></time>
                                            <button aria-label="10 likes"></button>
                                            <button aria-label="5 replies"></button>
                                            <button aria-label="100 views"></button>
                                        </div>
                                    </body>
                                </html>
                            `
                        });
                    } else if (!req.isIntercepted()) {
                        req.continue();
                    }
                } catch (e) { }
            });
        });

        // Run the real scrapeAccount method with a longer timeout
        const results = await scraper.scrapeAccount('testuser');

        expect(results.length).toBeGreaterThan(0);
        const post = results[0];
        expect(post.authorUsername).toBe('testuser');
        expect(post.threadId).toBe('post123');
    }, 30000); // 30s timeout
});
