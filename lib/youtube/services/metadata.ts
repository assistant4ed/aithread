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

    const ytdlpArgs = [
        '--dump-json',          // output JSON and exit, no download
        '--no-playlist',        // if URL is a playlist, only process first video
        '--socket-timeout', '30',
        // Try multiple player clients for better success rate
        // Priority: ios > android > web (ios has best bypass currently)
        '--extractor-args', 'youtube:player_client=ios,android,web',
        '--user-agent', 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
    ];

    // YouTube now requires cookies for most videos (bot detection update Oct 2025+)
    // Support two methods:
    // 1. YOUTUBE_COOKIES_FILE - path to Netscape cookies.txt file (recommended for servers)
    // 2. YOUTUBE_COOKIES_BROWSER - browser name for --cookies-from-browser (local dev only)
    const cookiesFile = process.env.YOUTUBE_COOKIES_FILE;
    const cookiesBrowser = process.env.YOUTUBE_COOKIES_BROWSER;

    if (cookiesFile) {
        ytdlpArgs.push('--cookies', cookiesFile);
        console.log(`[yt-dlp] Using cookies from file: ${cookiesFile}`);
    } else if (cookiesBrowser) {
        ytdlpArgs.push('--cookies-from-browser', cookiesBrowser);
        console.log(`[yt-dlp] Using cookies from browser: ${cookiesBrowser}`);
    } else {
        console.warn('[yt-dlp] ⚠️  No cookies configured - videos may fail with bot detection. Set YOUTUBE_COOKIES_FILE or YOUTUBE_COOKIES_BROWSER env var.');
    }

    ytdlpArgs.push(videoUrl);

    // Debug: log the exact command being executed
    console.log('[yt-dlp] Executing command:', 'yt-dlp', ytdlpArgs.join(' '));

    try {
        const result = await execFileAsync('yt-dlp', ytdlpArgs);
        stdout = result.stdout;
    } catch (err: any) {
        // Enhanced error logging for debugging
        console.error('[yt-dlp] Full stderr:', err.stderr);
        console.error('[yt-dlp] Full stdout:', err.stdout);
        console.error('[yt-dlp] Error code:', err.code);

        // yt-dlp exits non-zero for private/deleted videos
        if (err.stderr?.includes('Private video')) {
            throw new Error(`VIDEO_PRIVATE: ${videoUrl}`);
        }
        if (err.stderr?.includes('Video unavailable') || err.stderr?.includes('not found')) {
            throw new Error(`VIDEO_UNAVAILABLE: ${videoUrl}`);
        }
        if (err.code === 'ENOENT') {
            throw new Error(`yt-dlp binary not found — is it installed?`);
        }
        if (err.stderr?.includes('JavaScript runtime')) {
            throw new Error(`yt-dlp requires JavaScript runtime - ensure Node.js is available in PATH. Error: ${err.stderr}`);
        }
        if (err.stderr?.includes('Sign in to confirm') || err.stderr?.includes('not a bot')) {
            throw new Error(`VIDEO_REQUIRES_AUTH: This video requires authentication or cookies. YouTube's bot detection is blocking access. Try a different, more popular video.`);
        }
        if (err.stderr?.includes('age')) {
            throw new Error(`VIDEO_AGE_RESTRICTED: This video is age-restricted and requires authentication.`);
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
