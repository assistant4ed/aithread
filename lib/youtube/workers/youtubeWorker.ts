import { Worker, Job } from 'bullmq';
import { YOUTUBE_QUEUE_NAME, redisConnection } from '../../queue.js';
import * as path from 'path';
import * as fs from 'fs/promises';
import { extractMetadata } from '../services/metadata.js';
import { extractTranscript } from '../services/transcript/index.js';
import { generateScript } from '../services/llm/index.js';
import { extractMediaAssets } from '../services/mediaAssets.js';
import { generatePDF } from '../services/pdfGenerator.js';
import { updateSheetsRow } from '../services/sheets.js';
import { uploadToGCS } from '../services/storage.js';
import type { YouTubeJobPayload } from '../types/youtube.js';
import { prisma } from '../../prisma.js';

const WORKER_VERSION = 'v1.1 (Groq Fallback)';
const OUTPUT_DIR = path.join(process.cwd(), 'output');

// Type enhancement for the result
export interface YouTubeJobResult {
    videoId: string;
    pdfPath: string;
    oneLiner: string;
    success: boolean;
    error?: string;
    sheetsRowIndex?: number;
}

export async function startWorker() {
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    console.log(`[Worker] Starting YouTube Automation worker (${WORKER_VERSION}) on queue: ${YOUTUBE_QUEUE_NAME}`);

    const worker = new Worker<YouTubeJobPayload, YouTubeJobResult>(
        YOUTUBE_QUEUE_NAME,
        async (job: Job<YouTubeJobPayload>) => {
            const { dbJobId, videoUrl, outputLanguage, includeFrames, sheetsRowIndex } = job.data;
            console.log(`[Job ${job.id} / DB ${dbJobId}] Processing ${videoUrl}...`);

            try {
                // Mark job as processing
                if (dbJobId) {
                    await prisma.youtubeJob.update({
                        where: { id: dbJobId },
                        data: { status: 'PROCESSING' }
                    });
                }

                job.updateProgress(10);
                const metadata = await extractMetadata(videoUrl);
                console.log(`[Job ${job.id}] Metadata extracted: ${metadata.title}`);

                job.updateProgress(30);
                const transcript = await extractTranscript(metadata.id, metadata);
                console.log(`[Job ${job.id}] Transcript extracted via ${transcript.source}`);

                job.updateProgress(50);
                const script = await generateScript(transcript, metadata, outputLanguage);
                console.log(`[Job ${job.id}] Script generated and translated`);

                job.updateProgress(70);
                let assets = { thumbnailPath: '', chapterScreenshots: {} };
                if (includeFrames) {
                    const chapterTimestamps = script.chapters.map(c => c.timestampStart).filter(Boolean);
                    assets = await extractMediaAssets(metadata.id, chapterTimestamps);
                } else {
                    // At least get the thumbnail if it exists in metadata (URL)
                    // pdfGenerator handles URL vs Path if we update it, but for now we extraction is fine
                    assets = await extractMediaAssets(metadata.id, []);
                }

                job.updateProgress(90);
                const outPdfName = `${metadata.id}_${outputLanguage}.pdf`;
                const pdfPath = path.join(OUTPUT_DIR, outPdfName);
                await generatePDF(script, assets, pdfPath);

                // Upload to GCS
                console.log(`[Job ${job.id}] Uploading to GCS...`);
                const gcsDestination = `youtube/pdfs/${outPdfName}`;
                await uploadToGCS(pdfPath, gcsDestination);

                // Clean up local files
                try {
                    await fs.unlink(pdfPath);
                    // Also cleanup assets if they exist locally
                    if (assets.thumbnailPath) await fs.unlink(assets.thumbnailPath).catch(() => { });
                    for (const s of Object.values(assets.chapterScreenshots) as string[]) {
                        await fs.unlink(s).catch(() => { });
                    }
                    console.log(`[Job ${job.id}] Local cleanup successful`);
                } catch (cleanupErr: any) {
                    console.warn(`[Job ${job.id}] Cleanup warning: ${cleanupErr.message}`);
                }

                const result = {
                    videoId: metadata.id,
                    pdfPath: gcsDestination, // Store GCS path now
                    oneLiner: script.oneLinerSummary,
                    success: true,
                    sheetsRowIndex
                };

                // Mark job as completed in DB
                if (dbJobId) {
                    await prisma.youtubeJob.update({
                        where: { id: dbJobId },
                        data: {
                            status: 'COMPLETED',
                            pdfUrl: gcsDestination,
                            oneLiner: script.oneLinerSummary,
                            videoId: metadata.id
                        }
                    });
                }

                if (sheetsRowIndex !== undefined) {
                    await updateSheetsRow({
                        rowIndex: sheetsRowIndex,
                        status: 'DONE',
                        pdfPath,
                        summary: script.oneLinerSummary
                    });
                }

                console.log(`[Job ${job.id}] Completed successfully! Output: ${pdfPath}`);
                return result;

            } catch (err: any) {
                console.error(`[Job ${job.id}] Failed: ${err.message}`);

                // Mark job as failed in DB
                if (dbJobId) {
                    await prisma.youtubeJob.update({
                        where: { id: dbJobId },
                        data: {
                            status: 'FAILED',
                            error: err.message
                        }
                    });
                }

                if (sheetsRowIndex !== undefined) {
                    await updateSheetsRow({
                        rowIndex: sheetsRowIndex,
                        status: 'FAILED',
                        error: err.message
                    });
                }

                throw err;
            }
        },
        {
            connection: redisConnection,
            concurrency: 2 // Handle 2 videos at a time
        }
    );

    worker.on('failed', (job, err) => {
        console.error(`[Job ${job?.id}] Global Failure: ${err.message}`);
    });

    return worker;
}
