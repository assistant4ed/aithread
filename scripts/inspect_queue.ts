
import "dotenv/config";
import { Queue } from "bullmq";
import { SCRAPE_QUEUE_NAME, redisConnection } from "../lib/queue";

async function inspectQueue() {
    console.log(`=== Inspecting Queue: ${SCRAPE_QUEUE_NAME} ===`);
    const queue = new Queue(SCRAPE_QUEUE_NAME, { connection: redisConnection });

    const [waiting, active, completed, failed, delayed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
    ]);

    console.log(`Waiting:   ${waiting}`);
    console.log(`Active:    ${active}`);
    console.log(`Completed: ${completed}`);
    console.log(`Failed:    ${failed}`);
    console.log(`Delayed:   ${delayed}`);

    const failedJobs = await queue.getFailed(0, 5);
    const delayedJobs = await queue.getDelayed(0, 5);
    const problemJobs = [...failedJobs, ...delayedJobs];

    if (problemJobs.length > 0) {
        console.log("\nRecent Issues:");
        for (const job of problemJobs) {
            console.log(`- Job ${job.id}: ${job.failedReason}`);
        }
    }

    if (active > 0) {
        console.log("\nActive jobs (last 5):");
        const activeJobs = await queue.getActive(0, 5);
        for (const job of activeJobs) {
            console.log(`- Job ${job.id}`);
        }
    }

    await queue.close();
    process.exit(0);
}

inspectQueue().catch(console.error);
