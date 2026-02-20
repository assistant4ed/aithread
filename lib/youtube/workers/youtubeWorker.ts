import { Worker, Job } from 'bullmq';
import { Redis } from 'ioredis';
import * as path from 'path';
import * as fs from 'fs/promises';
import { extractMetadata } from '../services/metadata.js';
import { extractTranscript } from '../services/transcript/index.js';
import { generateScript } from '../services/llm/index.js';
import { extractMediaAssets } from '../services/mediaAssets.js';
import { generatePDF } from '../services/pdfGenerator.js';
import { updateSheetsRow } from '../services/sheets.js';
import type { YouTubeJobPayload } from '../types/youtube.js';

const QUEUE_NAME = 'youtube-automation';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
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

    const connection = new Redis(REDIS_URL, {
        maxRetriesPerRequest: null,
    });

    console.log(`[Worker] Starting YouTube Automation worker on queue: ${QUEUE_NAME}`);

    const worker = new Worker<YouTubeJobPayload, YouTubeJobResult>(
        QUEUE_NAME,
        async (job: Job<YouTubeJobPayload>) => {
            const { videoUrl, outputLanguage, includeFrames, sheetsRowIndex } = job.data;
            console.log(`[Job ${job.id}] Processing ${videoUrl}...`);

            try {
                // 1. Metadata Extraction
                job.updateProgress(10);
                const metadata = await extractMetadata(videoUrl);
                console.log(`[Job ${job.id}] Metadata extracted: ${metadata.title}`);

                // 2. Transcript Extraction
                job.updateProgress(30);
                const transcript = await extractTranscript(metadata.id, metadata);
                console.log(`[Job ${job.id}] Transcript extracted via ${transcript.source}`);

                // 3. LLM Script Generation
                job.updateProgress(50);
                const script = await generateScript(transcript, metadata, outputLanguage);
                console.log(`[Job ${job.id}] Script generated and translated`);

                // 4. Media Asset Extraction
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

                // 5. PDF Generation
                job.updateProgress(90);
                const outPdfName = `${metadata.id}_${outputLanguage}.pdf`;
                const pdfPath = path.join(OUTPUT_DIR, outPdfName);
                await generatePDF(script, assets, pdfPath);

                const result = {
                    videoId: metadata.id,
                    pdfPath,
                    oneLiner: script.oneLinerSummary,
                    success: true,
                    sheetsRowIndex
                };

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

                if (sheetsRowIndex !== undefined) {
                    await updateSheetsRow({
                        rowIndex: sheetsRowIndex,
                        status: 'FAILED',
                        error: err.message
                    });
                }

                return {
                    videoId: '',
                    pdfPath: '',
                    oneLiner: '',
                    success: false,
                    error: err.message,
                    sheetsRowIndex
                };
            }
        },
        {
            connection: connection as any,
            concurrency: 2 // Handle 2 videos at a time
        }
    );

    worker.on('failed', (job, err) => {
        console.error(`[Job ${job?.id}] Global Failure: ${err.message}`);
    });

    return worker;
}
