import { execFile } from 'child_process';
import { promisify } from 'util';
import type { VideoMetadata } from '../types/youtube.js';

const execFileAsync = promisify(execFile);

interface YtDlpInfo {
    id: string;
    title: string;
    uploader: string;
    uploader_url: string;
    upload_date: string;
    duration: number;
    view_count: number;
    like_count: number | null;
    thumbnail: string;
    tags: string[];
    categories: string[];
    language: string | null;
    description: string;
    subtitles: Record<string, unknown>;       // manual captions
    automatic_captions: Record<string, unknown>;  // auto-generated captions
}

export async function extractMetadata(videoUrl: string): Promise<VideoMetadata> {
    let stdout: string;

    try {
        const result = await execFileAsync('yt-dlp', [
            '--dump-json',          // output JSON and exit, no download
            '--no-playlist',        // if URL is a playlist, only process first video
            '--socket-timeout', '30',
            videoUrl,
        ]);
        stdout = result.stdout;
    } catch (err: any) {
        // yt-dlp exits non-zero for private/deleted videos
        if (err.stderr?.includes('Private video')) {
            throw new Error(`VIDEO_PRIVATE: ${videoUrl}`);
        }
        if (err.stderr?.includes('Video unavailable')) {
            throw new Error(`VIDEO_UNAVAILABLE: ${videoUrl}`);
        }
        if (err.code === 'ENOENT') {
            throw new Error(`yt-dlp binary not found — is it installed?`);
        }
        throw new Error(`yt-dlp metadata failed: ${err.stderr || err.message}`);
    }

    const info: YtDlpInfo = JSON.parse(stdout);

    const availableCaptionLanguages = [
        ...Object.keys(info.subtitles ?? {}),
        ...Object.keys(info.automatic_captions ?? {}),
    ];

    return {
        id: info.id,
        title: info.title,
        description: info.description?.slice(0, 2000) ?? '', // truncate — descriptions can be enormous
        channelName: info.uploader,
        channelUrl: info.uploader_url,
        uploadDate: info.upload_date,
        durationSeconds: info.duration,
        viewCount: info.view_count,
        likeCount: info.like_count,
        thumbnailUrl: info.thumbnail,
        tags: info.tags ?? [],
        categories: info.categories ?? [],
        language: info.language,
        hasManualCaptions: Object.keys(info.subtitles ?? {}).length > 0,
        hasAutoCaptions: Object.keys(info.automatic_captions ?? {}).length > 0,
        availableCaptionLanguages,
    };
}

export function extractVideoId(url: string): string {
    // Handle all YouTube URL formats
    const patterns = [
        /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
        /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
    ];

    for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) return match[1];
    }

    throw new Error(`Cannot extract video ID from URL: ${url}`);
}
