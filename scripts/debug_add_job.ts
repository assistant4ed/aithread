import "dotenv/config";
import { scrapeQueue, ScrapeJobData } from "../lib/queue";
import { WorkspaceSettings } from "../lib/processor";

async function main() {
    console.log("=== Debug: Manual Job Add ===");

    // Create dummy data
    const dummySettings: WorkspaceSettings = {
        translationPrompt: "test",
        hotScoreThreshold: 0,
        topicFilter: null,
        maxPostAgeHours: 24,
    };

    const jobData: ScrapeJobData = {
        username: "openai", // Use a known account
        workspaceId: "debug-test",
        settings: dummySettings,
        skipTranslation: true,
    };

    const jobId = `debug-${Date.now()}`;
    console.log(`Attempting to add job ${jobId}...`);

    try {
        const job = await scrapeQueue.add("scrape-account", jobData, {
            jobId: jobId,
            removeOnComplete: true,
        });
        console.log(`Search job added successfully! ID: ${job.id}`);
    } catch (err) {
        console.error("Failed to add job:", err);
    } finally {
        console.log("Closing queue connection...");
        await scrapeQueue.close();
        process.exit(0);
    }
}

main().catch(console.error);
