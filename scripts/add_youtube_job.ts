import "dotenv/config";
import { Queue } from "bullmq";
import { Redis } from "ioredis";

const REDIS_URL = process.env.REDIS_URL || "redis://localhost:6379";
const QUEUE_NAME = "youtube-automation";

async function addJob() {
    const videoUrl = process.argv[2];
    const language = (process.argv[3] as any) || "zh-HK";

    if (!videoUrl) {
        console.error("Usage: tsx scripts/add_youtube_job.ts <videoUrl> [language]");
        process.exit(1);
    }

    const connection = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
    });

    const queue = new Queue(QUEUE_NAME, { connection });

    console.log(`Adding job for: ${videoUrl} (Language: ${language})`);

    const job = await queue.add("process-video", {
        videoUrl,
        outputLanguage: language,
        includeFrames: true,
    });

    console.log(`✅ Job added! ID: ${job.id}`);

    await queue.close();
    process.exit(0);
}

addJob().catch(console.error);
