import { execFile } from 'child_process';
import { promisify } from 'util';
import * as path from 'path';
import * as fs from 'fs/promises';

const execFileAsync = promisify(execFile);
const TMP_DIR = path.join(process.cwd(), 'tmp');

export interface MediaAssets {
    thumbnailPath: string;
    chapterScreenshots: { [timestamp: string]: string };
}

export async function extractMediaAssets(
    videoId: string,
    chapterTimestamps: string[] // Format "MM:SS" or "HH:MM:SS"
): Promise<MediaAssets> {
    await fs.mkdir(TMP_DIR, { recursive: true });

    const thumbnailPath = path.join(TMP_DIR, `${videoId}_thumb.jpg`);
    const assets: MediaAssets = {
        thumbnailPath,
        chapterScreenshots: {}
    };

    // 1. Download thumbnail using yt-dlp
    console.log(`[Media] Downloading thumbnail for ${videoId}...`);
    try {
        await execFileAsync('yt-dlp', [
            '--write-thumbnail',
            '--skip-download',
            '--convert-thumbnails', 'jpg',
            '--output', thumbnailPath.replace(/\.jpg$/, ''), // yt-dlp adds extension
            `https://www.youtube.com/watch?v=${videoId}`
        ], {
            env: { ...process.env, PATH: `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}` }
        });

        // yt-dlp might save as .webp then convert, or just save as .jpg. 
        // Let's ensure we point to the actual file.
        if (!(await fileExists(thumbnailPath))) {
            const actualPath = thumbnailPath.replace(/\.jpg$/, '.webp');
            if (await fileExists(actualPath)) {
                assets.thumbnailPath = actualPath;
            }
        }
    } catch (err) {
        console.warn(`[Media] Failed to download thumbnail: ${err}`);
    }

    // 2. Extract keyframes for chapters using ffmpeg
    // We need the video URL. To avoid downloading the whole video, 
    // we can use yt-dlp to get a direct stream URL for ffmpeg.
    if (chapterTimestamps.length > 0) {
        console.log(`[Media] Extracting ${chapterTimestamps.length} chapter screenshots...`);
        try {
            const { stdout: streamUrl } = await execFileAsync('yt-dlp', [
                '-g',
                '-f', 'best[height<=480]',
                `https://www.youtube.com/watch?v=${videoId}`
            ], {
                env: { ...process.env, PATH: `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}` }
            });

            const url = streamUrl.trim().split('\n')[0];

            for (const ts of chapterTimestamps) {
                const screenshotPath = path.join(TMP_DIR, `${videoId}_ss_${ts.replace(/:/g, '-')}.jpg`);

                // ffmpeg seek and capture one frame
                await execFileAsync('ffmpeg', [
                    '-ss', ts,
                    '-i', url,
                    '-frames:v', '1',
                    '-q:v', '2',
                    '-y',
                    screenshotPath
                ], {
                    env: { ...process.env, PATH: `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}` }
                });

                if (await fileExists(screenshotPath)) {
                    assets.chapterScreenshots[ts] = screenshotPath;
                }
            }
        } catch (err) {
            console.warn(`[Media] Failed to extract screenshots: ${err}`);
        }
    }

    return assets;
}

async function fileExists(p: string): Promise<boolean> {
    try {
        await fs.access(p);
        return true;
    } catch {
        return false;
    }
}
