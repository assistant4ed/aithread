import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import { parseVTT } from './vttParser.js';
import type { TranscriptResult } from '../../types/youtube.js';

const execFileAsync = promisify(execFile);
const TMP_DIR = path.join(process.cwd(), 'tmp');

export async function ytdlpVttStrategy(
    videoId: string,
    preferredLang: string
): Promise<TranscriptResult> {

    await fs.mkdir(TMP_DIR, { recursive: true });
    const outputTemplate = path.join(TMP_DIR, `${videoId}`);
    const langsArg = [preferredLang, 'en'].join(',');

    // Try manual subtitles first
    try {
        await execFileAsync('yt-dlp', [
            '--write-subs',
            '--no-write-auto-subs',
            '--sub-langs', langsArg,
            '--sub-format', 'vtt/srt',
            '--skip-download',
            '--no-playlist',
            '--extractor-args', 'youtube:player_client=ios,android,web',
            '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            '--output', outputTemplate,
            `https://www.youtube.com/watch?v=${videoId}`,
        ], {
            timeout: 60_000,
            env: { ...process.env, PATH: `/usr/local/bin:/usr/bin:${process.env.PATH}` }
        });
    } catch {
        // If manual fails, try auto-generated
        await execFileAsync('yt-dlp', [
            '--write-auto-subs',
            '--no-write-subs',
            '--sub-langs', langsArg,
            '--sub-format', 'vtt/srt',
            '--skip-download',
            '--no-playlist',
            '--extractor-args', 'youtube:player_client=ios,android,web',
            '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            '--output', outputTemplate,
            `https://www.youtube.com/watch?v=${videoId}`,
        ], {
            timeout: 60_000,
            env: { ...process.env, PATH: `/usr/local/bin:/usr/bin:${process.env.PATH}` }
        });
    }

    // yt-dlp names files: videoId.LANG.vtt
    const tmpFiles = await fs.readdir(TMP_DIR);
    const subFile = tmpFiles
        .filter(f => f.startsWith(videoId) && (f.endsWith('.vtt') || f.endsWith('.srt')))
        .sort((a, b) => {
            // Prefer manual over auto (auto files contain "orig" in name)
            return a.includes('orig') ? 1 : -1;
        })[0];

    if (!subFile) {
        throw new Error(`yt-dlp ran but no subtitle file found for ${videoId}`);
    }

    const rawContent = await fs.readFile(path.join(TMP_DIR, subFile), 'utf-8');
    const detectedLang = subFile.split('.')[1]; // videoId.LANG.vtt

    // Cleanup
    await fs.unlink(path.join(TMP_DIR, subFile)).catch(() => { });

    const segments = parseVTT(rawContent);
    if (segments.length === 0) {
        throw new Error('VTT file parsed to empty segments');
    }

    return {
        segments,
        fullText: '',
        language: detectedLang,
        source: 'ytdlp-vtt',
        tokenEstimate: 0,
    };
}
