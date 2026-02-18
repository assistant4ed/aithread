
import { ThreadsScraper } from "../lib/scraper";
import { processPost } from "../lib/processor";

async function main() {
    console.log("Starting debug scrape for @openai...");
    const scraper = new ThreadsScraper();

    try {
        await scraper.init();
        const posts = await scraper.scrapeAccount("openai");

        console.log(`[Debug] Scraper found ${posts.length} raw posts.`);

        for (const post of posts) {
            console.log("---------------------------------------------------");
            console.log(`Post ID: ${post.threadId}`);
            console.log(`Content: ${post.content.substring(0, 50)}...`);
            console.log(`Date: ${post.postedAt} (Type: ${typeof post.postedAt})`);

            // Check Date Parsing
            if (post.postedAt) {
                const d = new Date(post.postedAt);
                console.log(`Parsed Date: ${d.toISOString()} (Valid: ${!isNaN(d.getTime())})`);
            } else {
                console.log(`Parsed Date: INVALID/MISSING`);
            }
        }

    } catch (e) {
        console.error("Error:", e);
    } finally {
        await scraper.close();
    }
}

main();
