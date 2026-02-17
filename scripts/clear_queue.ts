
import "dotenv/config";
import { Queue } from "bullmq";
import { SCRAPE_QUEUE_NAME, redisConnection } from "../lib/queue";

async function clearQueue() {
    console.log(`=== Clearing Queue: ${SCRAPE_QUEUE_NAME} ===`);
    const queue = new Queue(SCRAPE_QUEUE_NAME, { connection: redisConnection });

    await queue.drain(true); // Remove all waiting jobs
    await queue.clean(0, 1000, "failed");
    await queue.clean(0, 1000, "completed");

    // Also remove any "active" jobs that might be hung
    const active = await queue.getJobs(["active"]);
    for (const job of active) {
        await job.remove();
    }

    console.log("Queue cleared!");
    await queue.close();
    process.exit(0);
}

clearQueue().catch(console.error);
