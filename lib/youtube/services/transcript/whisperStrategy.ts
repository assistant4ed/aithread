import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import { createReadStream } from 'fs';
import * as path from 'path';
import OpenAI from 'openai';
import type { TranscriptResult } from '../../types/youtube.js';

const execFileAsync = promisify(execFile);
const TMP_DIR = path.join(process.cwd(), 'tmp');

// Whisper API limit: 25MB. A 1hr video at low bitrate ≈ 30-60MB.
// Strategy: download at very low quality, check size, split if needed.
const MAX_WHISPER_MB = 24;

export async function whisperStrategy(
    videoId: string,
    durationSeconds: number
): Promise<TranscriptResult> {
    const useOpenRouter = !!process.env.OPENROUTER_API_KEY && !process.env.OPENAI_API_KEY;
    if (!process.env.OPENAI_API_KEY && !process.env.OPENROUTER_API_KEY) {
        throw new Error('Neither OPENAI_API_KEY nor OPENROUTER_API_KEY is set');
    }

    const audioPath = path.join(TMP_DIR, `${videoId}.mp3`);

    try {
        await fs.mkdir(TMP_DIR, { recursive: true });

        // Build yt-dlp arguments with cookie and runtime support
        const cookiesFile = process.env.YOUTUBE_COOKIES_FILE;
        const cookiesBrowser = process.env.YOUTUBE_COOKIES_BROWSER;
        const hasCookies = !!(cookiesFile || cookiesBrowser);

        const ytdlpArgs = [
            '--extract-audio',
            '--audio-format', 'mp3',
            '--audio-quality', '9', // lowest quality (VBR ~60kbps) — good enough for Whisper
            '--no-playlist',
            '--js-runtimes', 'node', // Use Node.js for JavaScript execution
            '--output', audioPath,
        ];

        // Add cookies if available
        if (cookiesFile) {
            ytdlpArgs.push('--cookies', cookiesFile);
        } else if (cookiesBrowser) {
            ytdlpArgs.push('--cookies-from-browser', cookiesBrowser);
        }

        // Add user-agent for authenticated requests
        if (hasCookies) {
            ytdlpArgs.push('--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36');
        }

        ytdlpArgs.push(`https://www.youtube.com/watch?v=${videoId}`);

        await execFileAsync('yt-dlp', ytdlpArgs, {
            timeout: 300_000,
            env: {
                ...process.env,
                PATH: `/usr/local/bin:/usr/bin:${process.env.PATH}`,
                NODE_PATH: process.execPath,
            }
        });

        const stat = await fs.stat(audioPath);
        const sizeMB = stat.size / 1_048_576;

        let fullText: string;

        if (useOpenRouter) {
            // NOTE: OpenRouter doesn't have a direct "audio" transcription API like Whisper.
            // A better fallback for dev without OpenAI/Whisper might be to skip or use a local tool if available.
            // For now, if OPENAI_API_KEY is missing, we'll try to find a proxy or just fail gracefully.
            // Actually, let's keep it simple: Whisper REQUIRES OpenAI. 
            // If the user wants a free dev alternative, they should use a video with captions or provide a minimal OpenAI key.
            throw new Error('Whisper strategy currently REQUIRES OPENAI_API_KEY. Use a video with captions for OpenRouter testing.');
        } else {
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
            if (sizeMB <= MAX_WHISPER_MB) {
                fullText = await transcribeFile(openai, audioPath);
            } else {
                // File too large — split into chunks using ffmpeg
                console.log(`[Whisper] Audio ${sizeMB.toFixed(1)}MB exceeds limit, splitting...`);
                fullText = await transcribeInChunks(openai, audioPath, videoId, durationSeconds);
            }
        }

        return {
            segments: [{ text: fullText, startSeconds: 0, durationSeconds }],
            fullText,
            language: 'detected-by-whisper',
            source: 'whisper',
            tokenEstimate: 0,
        };
    } finally {
        // Always cleanup audio files — they're large
        await fs.unlink(audioPath).catch(() => { });
    }
}

async function transcribeFile(openai: OpenAI, filePath: string): Promise<string> {
    const response = await openai.audio.transcriptions.create({
        file: createReadStream(filePath),
        model: 'whisper-1',
        response_format: 'text',
        // Don't specify language — let Whisper auto-detect
    });

    return response as unknown as string;
}

async function transcribeInChunks(
    openai: OpenAI,
    audioPath: string,
    videoId: string,
    totalDuration: number
): Promise<string> {

    // Split into 20-minute chunks (safely under 25MB at low quality)
    const chunkDuration = 20 * 60; // seconds
    const chunks: string[] = [];

    for (let start = 0; start < totalDuration; start += chunkDuration) {
        const chunkPath = path.join(TMP_DIR, `${videoId}_chunk_${start}.mp3`);

        await execFileAsync('ffmpeg', [
            '-i', audioPath,
            '-ss', String(start),
            '-t', String(chunkDuration),
            '-acodec', 'copy',
            '-y',  // overwrite
            chunkPath,
        ], {
            env: { ...process.env, PATH: `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}` }
        });

        const text = await transcribeFile(openai, chunkPath);
        chunks.push(text);
        await fs.unlink(chunkPath).catch(() => { });
    }

    return chunks.join(' ');
}
