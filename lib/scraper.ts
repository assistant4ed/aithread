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

    async scrapeAccount(username: string, since?: Date): Promise<ThreadPost[]> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();

        // Safety limit to prevent infinite loops if dates aren't parsing or layout changes
        const MAX_SCROLLS = 20;
        const allPosts = new Map<string, ThreadPost>();

        try {
            console.log(`Navigating to https://www.threads.net/@${username}`);
            await page.goto(`https://www.threads.net/@${username}`, { waitUntil: 'networkidle2', timeout: 60000 });

            await page.waitForSelector('body', { timeout: 10000 });

            // Initial wait for hydration
            await new Promise(resolve => setTimeout(resolve, 2000));

            let scrollCount = 0;
            let finished = false;

            while (scrollCount < MAX_SCROLLS && !finished) {
                // 1. Scrape current view
                const rawPosts = await page.evaluate(() => {
                    // Selectors for both old and new Threads UI structures
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

                        let views = 0;
                        let likes = 0;
                        let replies = 0;
                        let reposts = 0;

                        const innerText = el.innerText || "";
                        const lines = innerText.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);

                        const viewEl = el.querySelector('[aria-label*="views"]');
                        if (viewEl) {
                            const str = viewEl.getAttribute('aria-label');
                            if (str) {
                                let n = parseFloat(str.replace(/,/g, ''));
                                if (str.toUpperCase().includes('K')) n = n * 1000;
                                if (str.toUpperCase().includes('M')) n = n * 1000000;
                                views = isNaN(n) ? 0 : n;
                            }
                        }

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
                        if (likes === 0 && replies === 0 && reposts === 0) {
                            const numberLines = lines.filter((l: string) => l.match(/^\d+(\.\d+)?[KM]?$/));
                            if (numberLines.length >= 2) {
                                const metrics = numberLines.slice(0, 4);
                                if (metrics.length >= 1) {
                                    const s = metrics[0];
                                    let n = parseFloat(s.replace(/,/g, ''));
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    likes = isNaN(n) ? 0 : n;
                                }
                                if (metrics.length >= 2) {
                                    const s = metrics[1];
                                    let n = parseFloat(s.replace(/,/g, ''));
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    replies = isNaN(n) ? 0 : n;
                                }
                                if (metrics.length >= 3) {
                                    const s = metrics[2];
                                    let n = parseFloat(s.replace(/,/g, ''));
                                    if (s.toUpperCase().includes('K')) n = n * 1000;
                                    if (s.toUpperCase().includes('M')) n = n * 1000000;
                                    reposts = isNaN(n) ? 0 : n;
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
                            views,
                            likes,
                            replies,
                            reposts,
                            mediaUrls: media,
                            postUrl,
                            postedAt: postedAt
                        };
                    });
                });

                // 2. Process and add to map
                let foundNew = false;
                let foundOld = false;

                for (const p of rawPosts) {
                    if (!p.postedAt) continue;

                    const d = new Date(p.postedAt);
                    if (isNaN(d.getTime())) continue;

                    // Fix date object
                    (p as any).postedAt = d;

                    // Deduplicate key
                    const existing = allPosts.get(p.threadId);

                    // Logic: Keep the one with more metrics (avoids capturing "Reply" elements that link to parent but have no stats)
                    const currentScore = (p.likes || 0) + (p.replies || 0) + (p.reposts || 0);
                    const existingScore = existing ? (existing.likes || 0) + (existing.replies || 0) + (existing.reposts || 0) : -1;

                    if (!existing || currentScore > existingScore) {
                        allPosts.set(p.threadId, p as unknown as ThreadPost);
                        if (!existing) foundNew = true;
                    }

                    // Check age limit
                    // Logic Update: Only considered "reached old posts" if the *last* post in the batch is old. 
                    // This prevents Pinned posts (which are old but at the top) from triggering a premature stop.
                    // We'll check this outside the loop for the last item, or here if we track index.
                }

                // Check if the last post in rawPosts is old
                if (rawPosts.length > 0 && since) {
                    const lastPost = rawPosts[rawPosts.length - 1];
                    if (lastPost.postedAt) { // postedAt is Date now due to fix above? No, rawPosts has string/converted.
                        // rawPosts elements are modified in place in the loop above? 
                        // No, I did `(p as any).postedAt = d`. Yes, modified in place.
                        const d = (lastPost as any).postedAt;
                        if (d instanceof Date && d < since) {
                            foundOld = true;
                        }
                    }
                }

                // 3. Logic: 
                //    - If we found an old post, we can stop (we have enough history).
                //    - If we didn't find ANY new posts in this scroll, we might be stuck or at end.
                //    - Otherwise, scroll more.

                if (foundOld) {
                    console.log(`[Scraper] Reached posts older than ${since?.toISOString()}. Stopping.`);
                    finished = true;
                } else if (!foundNew && scrollCount > 0) {
                    console.log("[Scraper] No new posts found in this scroll. Stopping.");
                    finished = true;
                } else {
                    console.log(`[Scraper] Scroll ${scrollCount + 1}/${MAX_SCROLLS}: Found ${rawPosts.length} posts (Total unique: ${allPosts.size}). Scrolling...`);

                    await page.evaluate(async () => {
                        window.scrollBy(0, 3000);
                        await new Promise(r => setTimeout(r, 2000));
                    });

                    scrollCount++;
                }
            }

            const results = Array.from(allPosts.values());
            // Sort newest-first
            results.sort((a: any, b: any) => b.postedAt!.getTime() - a.postedAt!.getTime());

            return results;

        } catch (error) {
            console.error(`Error scraping ${username}:`, error);
            // Return what we have so far
            const results = Array.from(allPosts.values());
            results.sort((a: any, b: any) => (b.postedAt?.getTime() || 0) - (a.postedAt?.getTime() || 0));
            return results;
        } finally {
            await page.close();
        }
    }

    /**
     * Scrape the follower count from an account's profile page.
     * Returns 0 if it cannot be determined.
     */
    async getFollowerCount(username: string): Promise<number> {
        if (!this.browser) await this.init();
        const page = await this.browser!.newPage();
        try {
            console.log(`[Scraper] Fetching follower count for @${username}`);
            await page.goto(`https://www.threads.net/@${username}`, { waitUntil: 'networkidle2', timeout: 60000 });
            await new Promise(resolve => setTimeout(resolve, 2000));

            const followerCount = await page.evaluate(() => {
                // Strategy 1: aria-label on follower count element
                const followerEl = document.querySelector('[aria-label*="followers"]');
                if (followerEl) {
                    const str = followerEl.getAttribute('aria-label') || followerEl.textContent || '';
                    let n = parseFloat(str.replace(/,/g, ''));
                    if (str.toUpperCase().includes('K')) n = n * 1000;
                    if (str.toUpperCase().includes('M')) n = n * 1000000;
                    if (!isNaN(n) && n > 0) return Math.round(n);
                }

                // Strategy 2: Look for text containing "followers" near a number
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
}
