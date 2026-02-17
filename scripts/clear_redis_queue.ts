import "dotenv/config";
import { scrapeQueue } from "../lib/queue";

async function main() {
    console.log("=== Clearing Scrape Queue ===");

    await scrapeQueue.obliterate({ force: true });
    console.log("Queue obliterated.");

    process.exit(0);
}

main().catch(console.error);
