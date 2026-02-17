import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

export interface MediaItem {
    url: string;
    type: 'image' | 'video';
}

export interface ThreadPost {
    threadId: string;
    content: string;
    mediaUrls: MediaItem[];
    likes: number;
    replies: number;
    reposts: number;
    postedAt?: Date;
    postUrl: string;
}

export class ThreadsScraper {
    private browser: Browser | null = null;

    async init() {
        if (!this.browser) {
            puppeteer.use(StealthPlugin());
            this.browser = await puppeteer.launch({
                headless: true,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    async getPageContent(username: string): Promise<string> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();
        try {
            await page.goto(`https://www.threads.net/@${username}`, { waitUntil: 'networkidle2', timeout: 60000 });
            return await page.content();
        } catch (e) {
            console.error(e);
            return "";
        } finally {
            await page.close();
        }
    }

    async scrapeAccount(username: string): Promise<ThreadPost[]> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();

        try {
            console.log(`Navigating to https://www.threads.net/@${username}`);
            await page.goto(`https://www.threads.net/@${username}`, { waitUntil: 'networkidle2', timeout: 60000 });

            await page.waitForSelector('body', { timeout: 10000 });

            // Scroll down to trigger lazy loading of media/videos
            await page.evaluate(async () => {
                await new Promise<void>((resolve) => {
                    let totalHeight = 0;
                    const distance = 100;
                    const timer = setInterval(() => {
                        const scrollHeight = document.body.scrollHeight;
                        window.scrollBy(0, distance);
                        totalHeight += distance;
                        if (totalHeight >= 2000) {
                            clearInterval(timer);
                            resolve();
                        }
                    }, 100);
                });
            });

            await new Promise(resolve => setTimeout(resolve, 2000));

            const posts = await page.evaluate(() => {
                const potentialSelectors = [
                    'div[data-pressable-container="true"]',
                    'div[role="article"]',
                    'div[aria-label*="Thread"]'
                ];

                let postElements: Element[] = [];
                for (const sel of potentialSelectors) {
                    const found = Array.from(document.querySelectorAll(sel));
                    if (found.length > 0) {
                        postElements = found;
                        break;
                    }
                }

                return postElements.map((el: any) => {
                    const text = el.textContent || "";

                    const videos = Array.from(el.querySelectorAll('video'))
                        .map((vid: any) => vid.src || '')
                        .filter((src: string) => src.startsWith('http'))
                        .map((src: string) => ({ url: src, type: 'video' as const }));

                    const images = Array.from(el.querySelectorAll('img'))
                        .filter((img: any) => {
                            const alt = (img.alt || '').toLowerCase();
                            return !alt.includes('profile picture');
                        })
                        .map((img: any) => img.src)
                        .filter((src: string) => src.startsWith('http'))
                        .map((src: string) => ({ url: src, type: 'image' as const }));

                    const media = videos.length > 0 ? videos : images;

                    const links = Array.from(el.querySelectorAll('a')).map((a: any) => a.href);
                    const postUrl = links.find((l: string) => l.includes('/post/')) || "";

                    let likes = 0;
                    let replies = 0;
                    let reposts = 0;

                    const innerText = el.innerText || "";
                    const lines = innerText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

                    const likeEl = el.querySelector('[aria-label*="likes"]');
                    if (likeEl) {
                        const str = likeEl.getAttribute('aria-label');
                        if (str) {
                            let n = parseFloat(str.replace(/,/g, ''));
                            if (str.toUpperCase().includes('K')) n = n * 1000;
                            if (str.toUpperCase().includes('M')) n = n * 1000000;
                            likes = isNaN(n) ? 0 : n;
                        }
                    }

                    const replyEl = el.querySelector('[aria-label*="replies"]');
                    if (replyEl) {
                        const str = replyEl.getAttribute('aria-label');
                        if (str) {
                            let n = parseFloat(str.replace(/,/g, ''));
                            if (str.toUpperCase().includes('K')) n = n * 1000;
                            if (str.toUpperCase().includes('M')) n = n * 1000000;
                            replies = isNaN(n) ? 0 : n;
                        }
                    }

                    const repostEl = el.querySelector('[aria-label*="reposts"]');
                    if (repostEl) {
                        const str = repostEl.getAttribute('aria-label');
                        if (str) {
                            let n = parseFloat(str.replace(/,/g, ''));
                            if (str.toUpperCase().includes('K')) n = n * 1000;
                            if (str.toUpperCase().includes('M')) n = n * 1000000;
                            reposts = isNaN(n) ? 0 : n;
                        }
                    }

                    // Strategy 2: Numeric lines at the end of the text
                    // If metrics are 0, check for isolated numbers in the text lines
                    if (likes === 0 && replies === 0 && reposts === 0) {
                        // Find lines that look like numbers
                        const numberLines = lines.filter((l: string) => l.match(/^\d+(\.\d+)?[KM]?$/));

                        if (numberLines.length >= 2) {
                            // Take the last 3 numbers if available, or last 2
                            const metrics = numberLines.slice(-3); // at most 3

                            if (metrics.length === 3) {
                                const s1 = metrics[0];
                                let n1 = parseFloat(s1.replace(/,/g, ''));
                                if (s1.toUpperCase().includes('K')) n1 = n1 * 1000;
                                if (s1.toUpperCase().includes('M')) n1 = n1 * 1000000;
                                likes = isNaN(n1) ? 0 : n1;

                                const s2 = metrics[1];
                                let n2 = parseFloat(s2.replace(/,/g, ''));
                                if (s2.toUpperCase().includes('K')) n2 = n2 * 1000;
                                if (s2.toUpperCase().includes('M')) n2 = n2 * 1000000;
                                replies = isNaN(n2) ? 0 : n2;

                                const s3 = metrics[2];
                                let n3 = parseFloat(s3.replace(/,/g, ''));
                                if (s3.toUpperCase().includes('K')) n3 = n3 * 1000;
                                if (s3.toUpperCase().includes('M')) n3 = n3 * 1000000;
                                reposts = isNaN(n3) ? 0 : n3;

                            } else if (metrics.length === 2) {
                                const s1 = metrics[0];
                                let n1 = parseFloat(s1.replace(/,/g, ''));
                                if (s1.toUpperCase().includes('K')) n1 = n1 * 1000;
                                if (s1.toUpperCase().includes('M')) n1 = n1 * 1000000;
                                likes = isNaN(n1) ? 0 : n1;

                                const s2 = metrics[1];
                                let n2 = parseFloat(s2.replace(/,/g, ''));
                                if (s2.toUpperCase().includes('K')) n2 = n2 * 1000;
                                if (s2.toUpperCase().includes('M')) n2 = n2 * 1000000;
                                replies = isNaN(n2) ? 0 : n2;
                            } else if (metrics.length === 1) {
                                const s1 = metrics[0];
                                let n1 = parseFloat(s1.replace(/,/g, ''));
                                if (s1.toUpperCase().includes('K')) n1 = n1 * 1000;
                                if (s1.toUpperCase().includes('M')) n1 = n1 * 1000000;
                                likes = isNaN(n1) ? 0 : n1;
                            }
                        }
                    }

                    let postedAt: string | null = null;
                    const timeEl = el.querySelector('time');
                    if (timeEl) {
                        postedAt = timeEl.getAttribute('datetime');
                    }

                    return {
                        content: innerText.slice(0, 300),
                        threadId: postUrl.split('/post/')[1]?.split('?')[0] || "unknown",
                        likes,
                        replies,
                        reposts,
                        mediaUrls: media,
                        postUrl,
                        postedAt: postedAt ? new Date(postedAt) : undefined,
                    };
                });
            });

            return posts;

        } catch (error) {
            console.error(`Error scraping ${username}:`, error);
            return [];
        } finally {
            await page.close();
        }
    }
}
