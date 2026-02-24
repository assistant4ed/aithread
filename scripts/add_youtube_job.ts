import "dotenv/config";
import { youtubeQueue } from "../lib/queue";
import { prisma } from "../lib/prisma";

async function addJob() {
    const videoUrl = process.argv[2];
    const language = (process.argv[3] as any) || "zh-HK";

    if (!videoUrl) {
        console.error("Usage: pnpm exec tsx scripts/add_youtube_job.ts <videoUrl> [language]");
        process.exit(1);
    }

    console.log(`Adding job for: ${videoUrl} (Language: ${language})`);

    // 1. Find a user to assign the job to (required by DB schema)
    const user = await prisma.user.findFirst();
    if (!user) {
        console.error("❌ No users found in database. Cannot create job record.");
        process.exit(1);
    }

    // 2. Create Database Record
    const dbJob = await prisma.youtubeJob.create({
        data: {
            videoUrl,
            language,
            status: "PENDING",
            requestedById: user.id
        }
    });

    // 3. Queue Job
    const job = await youtubeQueue.add("process-video", {
        dbJobId: dbJob.id,
        videoUrl,
        outputLanguage: language,
        includeFrames: true,
        requestedBy: user.id
    });

    console.log(`✅ Job added! ID: ${job.id}`);

    await youtubeQueue.close();
    process.exit(0);
}

addJob().catch(console.error);
