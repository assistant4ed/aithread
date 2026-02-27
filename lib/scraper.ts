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
    views: number;
    likes: number;
    replies: number;
    reposts: number;
    postedAt?: Date;
    postUrl: string;
    externalUrls: string[];
    authorId: string;
    authorUsername: string;
}

export class ThreadsScraper {
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
                    '--disable-software-rasterizer',
                    '--no-zygote',
                    '--disable-extensions',
                    '--disable-background-networking',
                    '--disable-default-apps',
                    '--disable-sync',
                    '--disable-translate',
                    '--mute-audio',
                    '--no-first-run',
                    '--js-flags=--max-old-space-size=256',
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

    async getPageContent(username: string): Promise<string> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();
        await this.configurePage(page);
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

    async scrapeAccount(username: string, since?: Date): Promise<ThreadPost[]> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();
        await this.configurePage(page);

        const MAX_SCROLLS = 20;
        const allPosts = new Map<string, ThreadPost>();

        try {
            console.log(`Navigating to https://www.threads.net/@${username}`);
            await page.goto(`https://www.threads.net/@${username}`, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.waitForSelector('body', { timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            let scrollCount = 0;
            let finished = false;

            while (scrollCount < MAX_SCROLLS && !finished) {
                const rawPosts = await page.evaluate(() => {
                    const potentialSelectors = [
                        'div[data-pressable="true"]',
                        'div[data-pressable-container="true"]',
                        'div[role="article"]',
                        'div[aria-label*="Thread"]'
                    ];

                    const allElements = new Set<Element>();
                    for (const sel of potentialSelectors) {
                        document.querySelectorAll(sel).forEach(el => allElements.add(el));
                    }

                    const postElements = Array.from(allElements);
                    if (postElements.length === 0) return [];

                    return postElements.map((el: any) => {
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

                        // Extract author information
                        const authorEl = el.querySelector('a[href*="/@"]');
                        const authorUsername = authorEl?.getAttribute('href')?.split('/@')[1]?.split('?')[0] || "";
                        const authorId = authorUsername; // Using username as ID for Threads platform

                        let views = 0, likes = 0, replies = 0, reposts = 0;

                        const innerText = el.innerText || "";
                        const lines = innerText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

                        const extractedLinks = Array.from(el.querySelectorAll('a'))
                            .map((a: any) => a.href)
                            .filter((href: string) => {
                                if (!href) return false;
                                try {
                                    const url = new URL(href, 'https://www.threads.net');
                                    const hostname = url.hostname.replace('www.', '');
                                    return !['threads.net', 'instagram.com', 'facebook.com', 'whatsapp.com'].includes(hostname)
                                        && !href.startsWith('mailto:')
                                        && !href.startsWith('tel:')
                                        && !href.includes('/post/')
                                        && !href.includes('/@');
                                } catch (e) { return false; }
                            });
                        const uniqueExternalLinks = Array.from(new Set(extractedLinks));

                        // Language-agnostic selectors (using partial matches for common metric words)
                        const viewEl = el.querySelector('[aria-label*="view"], [aria-label*="次查看"], [aria-label*="播放"], [aria-label*="浏览"]');
                        if (viewEl) {
                            const str = viewEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    views = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        const likeEl = el.querySelector('[aria-label*="like"], [aria-label*="讚"], [aria-label*="赞"], [aria-label*="喜"]');
                        if (likeEl) {
                            const str = likeEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    likes = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        const replyEl = el.querySelector('[aria-label*="repl"], [aria-label*="回覆"], [aria-label*="回复"]');
                        if (replyEl) {
                            const str = replyEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    replies = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        const repostEl = el.querySelector('[aria-label*="repost"], [aria-label*="轉發"], [aria-label*="转发"]');
                        if (repostEl) {
                            const str = repostEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    reposts = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        // Robust text-based fallback
                        if (likes === 0 && replies === 0 && reposts === 0) {
                            // Look for lines that contain a number, possibly followed by K/M and some text
                            const metrics = lines.filter((l: string) => l.match(/^\d+(\.\d+)?[KM]?(\s|$)/i)).slice(0, 4);
                            if (metrics.length >= 1) {
                                const s = metrics[0];
                                const match = s.match(/(\d+(\.\d+)?)/);
                                if (match) {
                                    let n = parseFloat(match[1]);
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    likes = n;
                                }
                            }
                            if (metrics.length >= 2) {
                                const s = metrics[1];
                                const match = s.match(/(\d+(\.\d+)?)/);
                                if (match) {
                                    let n = parseFloat(match[1]);
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    replies = n;
                                }
                            }
                            if (metrics.length >= 3) {
                                const s = metrics[2];
                                const match = s.match(/(\d+(\.\d+)?)/);
                                if (match) {
                                    let n = parseFloat(match[1]);
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    reposts = n;
                                }
                            }
                        }

                        let postedAt: string | null = null;
                        const timeEl = el.querySelector('time');
                        if (timeEl) postedAt = timeEl.getAttribute('datetime');

                        return {
                            content: innerText.slice(0, 300),
                            threadId: postUrl.split('/post/')[1]?.split('?')[0] || "unknown",
                            views, likes, replies, reposts,
                            mediaUrls: media,
                            externalUrls: uniqueExternalLinks,
                            postUrl,
                            postedAt: postedAt,
                            authorId,
                            authorUsername
                        };
                    });
                });

                let foundNew = false;
                let foundOld = false;

                for (const p of rawPosts) {
                    if (!p.postedAt) continue;
                    const d = new Date(p.postedAt);
                    if (isNaN(d.getTime())) continue;
                    (p as any).postedAt = d;

                    const existing = allPosts.get(p.threadId);
                    const currentScore = (p.likes || 0) + (p.replies || 0) + (p.reposts || 0);
                    const existingScore = existing ? (existing.likes || 0) + (existing.replies || 0) + (existing.reposts || 0) : -1;

                    if (!existing || currentScore > existingScore) {
                        allPosts.set(p.threadId, p as unknown as ThreadPost);
                        if (!existing) foundNew = true;
                    }
                }

                if (rawPosts.length > 0 && since) {
                    const lastPost = rawPosts[rawPosts.length - 1];
                    if (lastPost.postedAt) {
                        const d = (lastPost as any).postedAt;
                        if (d instanceof Date && d < since) foundOld = true;
                    }
                }

                if (foundOld) {
                    console.log(`[Scraper] Reached posts older than ${since?.toISOString()}. Stopping.`);
                    finished = true;
                } else if (!foundNew && scrollCount > 0) {
                    finished = true;
                } else {
                    console.log(`[Scraper] Scroll ${scrollCount + 1}/${MAX_SCROLLS}: Found ${rawPosts.length} posts (Total unique: ${allPosts.size}).`);
                    await page.evaluate(async () => {
                        window.scrollBy(0, 3000);
                        await new Promise(r => setTimeout(r, 2000));
                    });
                    scrollCount++;
                }
            }

            const results = Array.from(allPosts.values());
            results.sort((a: any, b: any) => b.postedAt!.getTime() - a.postedAt!.getTime());
            return results;
        } catch (error) {
            console.error(`Error scraping ${username}:`, error);
            const results = Array.from(allPosts.values());
            results.sort((a: any, b: any) => (b.postedAt?.getTime() || 0) - (a.postedAt?.getTime() || 0));
            return results;
        } finally {
            await page.close();
        }
    }

    async scrapeTopic(hashtag: string, since?: Date): Promise<ThreadPost[]> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();
        await this.configurePage(page);

        const MAX_SCROLLS = 30; // Increased to allow scanning past old posts
        const allPosts = new Map<string, ThreadPost>();
        const CONSECUTIVE_OLD_THRESHOLD = 50;
        let consecutiveOldCount = 0;

        try {
            const cleanHashtag = hashtag.startsWith('#') ? hashtag.substring(1) : hashtag;
            const searchUrl = `https://www.threads.net/search?q=${encodeURIComponent(cleanHashtag)}&serp_type=default`;
            console.log(`[Scraper] Navigating to ${searchUrl}`);
            await page.goto(searchUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            await page.waitForSelector('body', { timeout: 10000 });
            await new Promise(resolve => setTimeout(resolve, 3000));

            let scrollCount = 0;
            let finished = false;

            while (scrollCount < MAX_SCROLLS && !finished) {
                const rawPosts = await page.evaluate(() => {
                    const potentialSelectors = [
                        'div[data-pressable="true"]',
                        'div[data-pressable-container="true"]',
                        'div[role="article"]',
                        'div[aria-label*="Thread"]'
                    ];

                    const allElements = new Set<Element>();
                    for (const sel of potentialSelectors) {
                        document.querySelectorAll(sel).forEach(el => allElements.add(el));
                    }

                    const postElements = Array.from(allElements);
                    if (postElements.length === 0) return [];

                    return postElements.map((el: any) => {
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

                        // Extract author information
                        const authorEl = el.querySelector('a[href*="/@"]');
                        const authorUsername = authorEl?.getAttribute('href')?.split('/@')[1]?.split('?')[0] || "";
                        const authorId = authorUsername;

                        let views = 0, likes = 0, replies = 0, reposts = 0;

                        // Language-agnostic selectors
                        const viewEl = el.querySelector('[aria-label*="view"], [aria-label*="次查看"], [aria-label*="播放"], [aria-label*="浏览"]');
                        if (viewEl) {
                            const str = viewEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    views = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        const likeEl = el.querySelector('[aria-label*="like"], [aria-label*="讚"], [aria-label*="赞"], [aria-label*="喜"]');
                        if (likeEl) {
                            const str = likeEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    likes = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        const replyEl = el.querySelector('[aria-label*="repl"], [aria-label*="回覆"], [aria-label*="回复"]');
                        if (replyEl) {
                            const str = replyEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    replies = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        const repostEl = el.querySelector('[aria-label*="repost"], [aria-label*="轉發"], [aria-label*="转发"]');
                        if (repostEl) {
                            const str = repostEl.getAttribute('aria-label');
                            if (str) {
                                const match = str.match(/(\d[\d,\.]*)/);
                                if (match) {
                                    let n = parseFloat(match[1].replace(/,/g, ''));
                                    if (str.toUpperCase().includes('K')) n = n * 1000;
                                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                                    reposts = isNaN(n) ? 0 : n;
                                }
                            }
                        }

                        // Robust text-based fallback (missing in scrapeTopic original version)
                        if (likes === 0 && replies === 0 && reposts === 0) {
                            const innerText = el.innerText || "";
                            const lines = innerText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
                            const metrics = lines.filter((l: string) => l.match(/^\d+(\.\d+)?[KM]?(\s|$)/i)).slice(0, 4);
                            if (metrics.length >= 1) {
                                const s = metrics[0];
                                const match = s.match(/(\d+(\.\d+)?)/);
                                if (match) {
                                    let n = parseFloat(match[1]);
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    likes = n;
                                }
                            }
                            if (metrics.length >= 2) {
                                const s = metrics[1];
                                const match = s.match(/(\d+(\.\d+)?)/);
                                if (match) {
                                    let n = parseFloat(match[1]);
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    replies = n;
                                }
                            }
                            if (metrics.length >= 3) {
                                const s = metrics[2];
                                const match = s.match(/(\d+(\.\d+)?)/);
                                if (match) {
                                    let n = parseFloat(match[1]);
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    reposts = n;
                                }
                            }
                        }

                        let postedAt: string | null = null;
                        const timeEl = el.querySelector('time');
                        if (timeEl) postedAt = timeEl.getAttribute('datetime');

                        return {
                            content: el.innerText?.slice(0, 500) || "",
                            threadId: postUrl.split('/post/')[1]?.split('?')[0] || "unknown",
                            views, likes, replies, reposts,
                            mediaUrls: media,
                            postUrl,
                            postedAt,
                            externalUrls: [],
                            authorId,
                            authorUsername
                        };
                    });
                });

                let foundNew = false;

                for (const p of rawPosts) {
                    if (!p.postedAt || p.threadId === "unknown") continue;
                    const d = new Date(p.postedAt);
                    if (isNaN(d.getTime())) continue;
                    (p as any).postedAt = d;

                    const existing = allPosts.get(p.threadId);

                    // Age filtering
                    const isOld = since && d < since;

                    if (isOld) {
                        consecutiveOldCount++;
                    } else {
                        consecutiveOldCount = 0; // Reset on any fresh post
                    }

                    if (consecutiveOldCount >= CONSECUTIVE_OLD_THRESHOLD) {
                        console.log(`[Scraper] Topic scrape stopping: ${consecutiveOldCount} consecutive old posts`);
                        finished = true;
                        break;
                    }

                    if (isOld) continue; // Don't add to allPosts if it's old (but we already incremented consecutiveOldCount)

                    const currentScore = (p.likes || 0) + (p.replies || 0);

                    if (!existing || currentScore > (existing.likes + existing.replies)) {
                        allPosts.set(p.threadId, p as unknown as ThreadPost);
                        if (!existing) foundNew = true;
                    }
                }

                if (finished) break;

                if (!foundNew && scrollCount > 5) {
                    console.log(`[Scraper] No new posts after ${scrollCount} scrolls. Stopping.`);
                    finished = true;
                } else {
                    console.log(`[Scraper] Scroll ${scrollCount + 1}: Total unique fresh: ${allPosts.size} (Consecutive old: ${consecutiveOldCount})`);
                    await page.evaluate(async () => {
                        window.scrollBy(0, 4000);
                        await new Promise(r => setTimeout(r, 2000));
                    });
                    scrollCount++;
                }
            }

            const results = Array.from(allPosts.values());
            results.sort((a: any, b: any) => b.postedAt!.getTime() - a.postedAt!.getTime());
            return results;
        } catch (error) {
            console.error(`[Scraper] Error scraping topic ${hashtag}:`, error);
            return Array.from(allPosts.values());
        } finally {
            await page.close();
        }
    }


    async getFollowerCount(username: string): Promise<number> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();
        await this.configurePage(page);
        try {
            console.log(`[Scraper] Fetching follower count for @${username}`);
            await page.goto(`https://www.threads.net/@${username}`, { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            const followerCount = await page.evaluate(() => {
                const followerEl = document.querySelector('[aria-label*="followers"]');
                if (followerEl) {
                    const str = followerEl.getAttribute('aria-label') || followerEl.textContent || '';
                    let n = parseFloat(str.replace(/,/g, ''));
                    if (str.toUpperCase().includes('K')) n = n * 1000;
                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                    if (!isNaN(n) && n > 0) return Math.round(n);
                }

                const allText = document.body.innerText;
                const match = allText.match(/(\d[\d,\.]*[KkMm]?)\s*followers/i);
                if (match) {
                    const raw = match[1];
                    let n = parseFloat(raw.replace(/,/g, ''));
                    if (raw.toUpperCase().includes('K')) n = n * 1000;
                    if (raw.toUpperCase().includes('M')) n = n * 1000000;
                    if (!isNaN(n) && n > 0) return Math.round(n);
                }
                return 0;
            });

            console.log(`[Scraper] @${username} follower count: ${followerCount}`);
            return followerCount;
        } catch (error) {
            console.error(`[Scraper] Failed to get follower count for @${username}:`, error);
            return 0;
        } finally {
            await page.close();
        }
    }

    async batchFetchFollowerCounts(usernames: string[]): Promise<{ id: string, followerCount: number }[]> {
        const results = [];
        for (const username of usernames) {
            const followerCount = await this.getFollowerCount(username);
            results.push({ id: username, followerCount });
            // Small delay between specific profile fetches to be gentle
            await new Promise(r => setTimeout(r, 1000));
        }
        return results;
    }

    async enrichPost(postUrl: string): Promise<{ videoUrl?: string; coverUrl?: string } | null> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();
        await this.configurePage(page);

        try {
            console.log(`[Enricher] Visiting ${postUrl}`);
            await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 60000 });
            const html = await page.content();

            const videoRegex = /"video_versions":\s*(\[[^\]]+\])/g;
            const imageRegex = /"image_versions2":\s*({"candidates":\[[^\]]+\]})/g;

            let match;
            let bestVideoUrl: string | undefined;
            let bestCoverUrl: string | undefined;

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
    private async configurePage(page: Page): Promise<void> {
        await page.setViewport({ width: 800, height: 600 });
        await page.setRequestInterception(true);
        page.on('request', (req) => {
            const type = req.resourceType();
            // Block heavy binary data but allow document/scripts/XHR/stylesheets
            if (['image', 'media', 'font'].includes(type)) {
                req.abort();
            } else {
                req.continue();
            }
        });
    }
}
