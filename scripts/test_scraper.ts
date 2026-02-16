import { ThreadsScraper } from "../lib/scraper";

async function main() {
    console.log("Testing scraper...");
    const scraper = new ThreadsScraper();
    await scraper.init();

    try {
        const posts = await scraper.scrapeAccount("openai");
        console.log("Scraped Posts:", posts);

        if (posts.length > 0) {
            console.log("Success! Found posts.");
        } else {
            console.log("No posts found. Saving HTML...");
            const html = await scraper.getPageContent("openai");
            const fs = require('fs');
            fs.writeFileSync('debug_threads.html', html);
        }
    } catch (e) {
        console.error("Scraper failed:", e);
    } finally {
        await scraper.close();
    }
}

main();
