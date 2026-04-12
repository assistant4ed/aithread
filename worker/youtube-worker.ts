import "dotenv/config";
import { startWorker } from "../lib/youtube/workers/youtubeWorker";
import http from "http";

const PORT = process.env.PORT || 8080;
const server = http.createServer((req, res) => {
    res.writeHead(200);
    res.end("YouTube Worker OK");
});
server.listen(PORT, () => {
    console.log(`[YouTubeWorker] Health check server listening on port ${PORT}`);
});

async function main() {
    console.log("=== YouTube Automation Worker ===");
    try {
        const worker = await startWorker();
        console.log("📡 Worker is listening for jobs on 'youtube-automation' queue...");

        // Handle graceful shutdown
        const shutdown = async () => {
            console.log("\n[Worker] Shutting down gracefully...");
            await worker.close();
            server.close();
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
