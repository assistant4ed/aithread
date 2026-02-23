import "dotenv/config";
import { youtubeQueue } from "../lib/queue";

async function addJob() {
    const videoUrl = process.argv[2];
    const language = (process.argv[3] as any) || "zh-HK";

    if (!videoUrl) {
        console.error("Usage: pnpm exec tsx scripts/add_youtube_job.ts <videoUrl> [language]");
        process.exit(1);
    }

    console.log(`Adding job for: ${videoUrl} (Language: ${language})`);

    const job = await youtubeQueue.add("process-video", {
        videoUrl,
        outputLanguage: language,
        includeFrames: true,
    });

    console.log(`✅ Job added! ID: ${job.id}`);

    await youtubeQueue.close();
    process.exit(0);
}

addJob().catch(console.error);
