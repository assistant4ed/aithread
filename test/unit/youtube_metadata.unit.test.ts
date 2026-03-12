import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { extractMetadata, extractVideoId } from '@/lib/youtube/services/metadata';
import { execFile } from 'child_process';
import { promisify } from 'util';

// Mock child_process
vi.mock('child_process', () => ({
    execFile: vi.fn(),
}));

vi.mock('util', () => ({
    promisify: (fn: any) => fn,
}));

describe('YouTube Metadata Extraction - Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('[HAPPY PATH] should extract metadata successfully with all fields', async () => {
        const mockMetadata = {
            id: 'dQw4w9WgXcQ',
            title: 'Test Video Title',
            uploader: 'Test Channel',
            uploader_url: 'https://www.youtube.com/@testchannel',
            upload_date: '20240101',
            duration: 300,
            view_count: 1000000,
            like_count: 50000,
            thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
            tags: ['test', 'video', 'tutorial'],
            categories: ['Education', 'Technology'],
            language: 'en',
            description: 'This is a test video description with useful content.',
            subtitles: { en: {}, 'zh-Hant': {} },
            automatic_captions: { en: {} },
        };

        (execFile as any).mockResolvedValue({
            stdout: JSON.stringify(mockMetadata),
            stderr: '',
        });

        const result = await extractMetadata('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

        expect(result.id).toBe('dQw4w9WgXcQ');
        expect(result.title).toBe('Test Video Title');
        expect(result.channelName).toBe('Test Channel');
        expect(result.durationSeconds).toBe(300);
        expect(result.viewCount).toBe(1000000);
        expect(result.hasManualCaptions).toBe(true);
        expect(result.hasAutoCaptions).toBe(true);
        expect(result.availableCaptionLanguages).toContain('en');
        expect(result.availableCaptionLanguages).toContain('zh-Hant');

        // Verify yt-dlp was called with correct arguments
        expect(execFile).toHaveBeenCalledWith('yt-dlp', expect.arrayContaining([
            '--dump-json',
            '--no-playlist',
            '--user-agent', expect.stringContaining('Mozilla'),
            'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
        ]));
    });

    it('[FAILURE 1] should throw VIDEO_PRIVATE error for private videos', async () => {
        (execFile as any).mockRejectedValue({
            stderr: 'ERROR: [youtube] dQw4w9WgXcQ: Private video. Sign in if you\'ve been granted access to this video',
            stdout: '',
            code: 1,
        });

        await expect(extractMetadata('https://www.youtube.com/watch?v=PRIVATE123'))
            .rejects.toThrow('VIDEO_PRIVATE');
    });

    it('[FAILURE 2] should throw VIDEO_UNAVAILABLE error for deleted/unavailable videos', async () => {
        (execFile as any).mockRejectedValue({
            stderr: 'ERROR: [youtube] Video unavailable: This video is no longer available',
            stdout: '',
            code: 1,
        });

        await expect(extractMetadata('https://www.youtube.com/watch?v=DELETED456'))
            .rejects.toThrow('VIDEO_UNAVAILABLE');
    });

    it('[FAILURE 3] should throw error when yt-dlp binary not found', async () => {
        (execFile as any).mockRejectedValue({
            code: 'ENOENT',
            message: 'spawn yt-dlp ENOENT',
        });

        await expect(extractMetadata('https://www.youtube.com/watch?v=test'))
            .rejects.toThrow('yt-dlp binary not found');
    });

    it('[FAILURE 4] should throw error when JavaScript runtime is missing', async () => {
        (execFile as any).mockRejectedValue({
            stderr: 'WARNING: [youtube] No supported JavaScript runtime could be found',
            stdout: '',
            code: 1,
        });

        await expect(extractMetadata('https://www.youtube.com/watch?v=test'))
            .rejects.toThrow('JavaScript runtime');
    });

    it('should extract video ID from standard YouTube URL', () => {
        expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from short YouTube URL', () => {
        expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from YouTube shorts URL', () => {
        expect(extractVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should extract video ID from YouTube embed URL', () => {
        expect(extractVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('should throw error for invalid YouTube URL', () => {
        expect(() => extractVideoId('https://not-youtube.com/watch?v=test'))
            .toThrow('Cannot extract video ID from URL');
    });
});
