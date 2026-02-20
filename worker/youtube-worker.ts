import "dotenv/config";
import { startWorker } from "../lib/youtube/workers/youtubeWorker";

async function main() {
    console.log("=== YouTube Automation Worker ===");
    try {
        const worker = await startWorker();
        console.log("📡 Worker is listening for jobs on 'youtube-automation' queue...");

        // Handle graceful shutdown
        const shutdown = async () => {
            console.log("\n[Worker] Shutting down gracefully...");
            await worker.close();
            console.log("[Worker] Closed. Goodbye.");
            process.exit(0);
        };

        process.on("SIGTERM", shutdown);
        process.on("SIGINT", shutdown);

    } catch (err) {
        console.error("Fatal Error starting YouTube Worker:", err);
        process.exit(1);
    }
}

main();
