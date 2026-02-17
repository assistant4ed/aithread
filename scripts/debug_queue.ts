import "dotenv/config";
import { Queue } from "bullmq";
import { SCRAPE_QUEUE_NAME, redisConnection } from "../lib/queue";

async function main() {
    console.log("=== Queue Debugger ===");
    console.log(`Connecting to Redis at ${redisConnection.host}:${redisConnection.port}...`);

    const queue = new Queue(SCRAPE_QUEUE_NAME, { connection: redisConnection });

    const counts = await queue.getJobCounts();
    console.log("Job Counts:", counts);

    const active = await queue.getActive();
    console.log(`Active jobs: ${active.length}`);
    active.forEach(j => console.log(` - ${j.id} (${j.name})`));

    const waiting = await queue.getWaiting();
    console.log(`Waiting jobs: ${waiting.length}`);
    waiting.forEach(j => console.log(` - ${j.id} (${j.name})`));

    const delayed = await queue.getDelayed();
    console.log(`Delayed jobs: ${delayed.length}`);
    delayed.forEach(j => {
        console.log(` - ${j.id} (${j.name})`);
        console.log(`   Attempts: ${j.attemptsMade}`);
        console.log(`   Failed Reason: ${j.failedReason}`);
        console.log(`   Stacktrace: ${j.stacktrace}`);
    });

    const failed = await queue.getFailed();
    console.log(`Failed jobs: ${failed.length}`);
    failed.forEach(j => {
        console.log(` - ${j.id} (${j.name})`);
        console.log(`   Failed Reason: ${j.failedReason}`);
    });
}

main().catch(console.error);
