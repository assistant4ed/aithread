import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

export interface MediaItem {
    url: string;
    type: 'image' | 'video';
    coverUrl?: string;
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
                    // Split lines for metric extraction if needed
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
                        // Find lines that look like numbers (e.g. "1.2K", "350", "1")
                        const numberLines = lines.filter((l: string) => l.match(/^\d+(\.\d+)?[KM]?$/));

                        if (numberLines.length >= 2) {
                            // Threads now often shows: [Likes, Replies, Reposts, Sends]
                            // If we have 4, we take the first 3. If we have 3, we take them all.
                            // If 2, we assume Likes/Replies.
                            const metrics = numberLines.slice(0, 4);

                            const parseMetric = (s: string) => {
                                let n = parseFloat(s.replace(/,/g, ''));
                                if (s.toUpperCase().includes('K')) n = n * 1000;
                                if (s.toUpperCase().includes('M')) n = n * 1000000;
                                return isNaN(n) ? 0 : n;
                            };

                            if (metrics.length >= 1) likes = parseMetric(metrics[0]);
                            if (metrics.length >= 2) replies = parseMetric(metrics[1]);
                            if (metrics.length >= 3) reposts = parseMetric(metrics[2]);
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
                        postedAt: postedAt // Return raw string
                    };
                });
            });

            // Filter out posts without a valid date (likely pinned or ad garbage)
            const filtered = posts.filter((p: any) => {
                if (!p.postedAt) return false;
                const d = new Date(p.postedAt);
                const isValid = !isNaN(d.getTime());
                if (isValid) {
                    p.postedAt = d;
                }
                return isValid;
            });
            return filtered as unknown as ThreadPost[];

        } catch (error) {
            console.error(`Error scraping ${username}:`, error);
            // return []; // Changed to return what we have so far? No, just empty array on main error.
            return [];
        } finally {
            await page.close();
        }
    }

    async enrichPost(postUrl: string): Promise<{ videoUrl?: string; coverUrl?: string } | null> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();

        try {
            console.log(`[Enricher] Visiting ${postUrl}`);
            await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            const html = await page.content();

            const videoRegex = /"video_versions":\s*(\[[^\]]+\])/g;
            const imageRegex = /"image_versions2":\s*({"candidates":\[[^\]]+\]})/g;

            let match;
            let bestVideoUrl: string | undefined;
            let bestCoverUrl: string | undefined;

            // Find video
            while ((match = videoRegex.exec(html)) !== null) {
                try {
                    const videoVersions = JSON.parse(match[1]);
                    if (videoVersions && videoVersions.length > 0) {
                        const candidate = videoVersions.find((v: any) => v.type === 101) || videoVersions[0];
                        if (candidate && candidate.url) {
                            bestVideoUrl = candidate.url.replace(/\\u0026/g, '&');
                            break;
                        }
                    }
                } catch (e) { }
            }

            // Find cover
            while ((match = imageRegex.exec(html)) !== null) {
                try {
                    const imageVersions = JSON.parse(match[1]);
                    if (imageVersions && imageVersions.candidates && imageVersions.candidates.length > 0) {
                        const candidate = imageVersions.candidates[0];
                        if (candidate && candidate.url) {
                            bestCoverUrl = candidate.url.replace(/\\u0026/g, '&');
                            break;
                        }
                    }
                } catch (e) { }
            }

            if (bestVideoUrl) {
                return { videoUrl: bestVideoUrl, coverUrl: bestCoverUrl };
            }

            return null;
        } catch (error) {
            console.error(`[Enricher] Failed to enrich ${postUrl}:`, error);
            return null;
        } finally {
            await page.close();
        }
    }
}
