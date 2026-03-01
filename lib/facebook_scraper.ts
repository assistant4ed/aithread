import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { Browser, Page } from 'puppeteer';

export interface FacebookPost {
    id: string;
    content: string;
    mediaUrls: { url: string; type: 'image' | 'video' }[];
    likes: number;
    comments: number;
    shares: number;
    postedAt?: Date;
    postUrl: string;
    authorName: string;
    authorId: string;
}

export class FacebookScraper {
    private browser: Browser | null = null;

    async init() {
        if (!this.browser) {
            puppeteer.use(StealthPlugin());
            this.browser = await puppeteer.launch({
                headless: true,
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-gpu',
                ],
            });
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }

    private async setCookies(page: Page, cookiesJson: string) {
        try {
            const cookies = JSON.parse(cookiesJson);
            if (Array.isArray(cookies)) {
                await page.setCookie(...cookies);
                console.log(`[FacebookScraper] Successfully set ${cookies.length} cookies.`);
            }
        } catch (e) {
            console.error('[FacebookScraper] Failed to set cookies:', e);
        }
    }

    async scrapeGroup(groupId: string, cookiesJson?: string, since?: Date): Promise<FacebookPost[]> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();

        if (cookiesJson) {
            await this.setCookies(page, cookiesJson);
        }

        const url = `https://www.facebook.com/groups/${groupId}?sorting_setting=CHRONOLOGICAL`;
        console.log(`[FacebookScraper] Navigating to ${url}`);

        try {
            await page.setViewport({ width: 1280, height: 800 });
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            // Wait for posts to load
            await page.waitForSelector('div[role="feed"]', { timeout: 30000 }).catch(() => { });

            // Simple scroll to load more
            await page.evaluate(async () => {
                window.scrollBy(0, 2000);
                await new Promise(r => setTimeout(r, 2000));
            });

            const posts = await page.evaluate(() => {
                const postElements = Array.from(document.querySelectorAll('div[role="article"]'));
                return postElements.map((el: any) => {
                    const content = el.querySelector('div[data-ad-preview="message"], div[data-ad-comet-preview="message"]')?.innerText || "";

                    // Basic heuristic for FB grouping - this needs refinement in real scenarios
                    const postUrlEl = el.querySelector('a[href*="/groups/"][href*="/posts/"]');
                    const postUrl = postUrlEl?.href || "";
                    const id = postUrl.split('/posts/')[1]?.split('/')[0]?.split('?')[0] || Math.random().toString(36).substring(7);

                    const authorEl = el.querySelector('h2 strong a, h3 strong a');
                    const authorName = authorEl?.innerText || "Unknown";
                    const authorId = authorEl?.href?.split('user/')[1]?.split('/')[0] || authorName;

                    // Media extraction
                    const images = Array.from(el.querySelectorAll('img'))
                        .map((img: any) => img.src)
                        .filter((src: string) => src.includes('fbcdn.net') && !src.includes('emoji'));

                    const media = images.map(url => ({ url, type: 'image' as const }));

                    return {
                        id,
                        content,
                        postUrl,
                        authorName,
                        authorId,
                        mediaUrls: media,
                        likes: 0, // Simplified for now
                        comments: 0,
                        shares: 0,
                    };
                });
            });

            return posts.map(p => ({
                ...p,
                postedAt: new Date(), // FB timestamp extraction is complex, defaulting to now for now
            })) as FacebookPost[];

        } catch (error) {
            console.error(`[FacebookScraper] Error scraping group ${groupId}:`, error);
            return [];
        } finally {
            await page.close();
        }
    }
}
