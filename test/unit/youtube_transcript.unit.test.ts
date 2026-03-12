import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ytdlpVttStrategy } from '@/lib/youtube/services/transcript/ytdlpStrategy';
import { execFile } from 'child_process';
import * as fs from 'fs/promises';

// Mock dependencies
vi.mock('child_process', () => ({
    execFile: vi.fn(),
}));

vi.mock('util', () => ({
    promisify: (fn: any) => fn,
}));

vi.mock('fs/promises', () => ({
    mkdir: vi.fn(),
    readdir: vi.fn(),
    readFile: vi.fn(),
    unlink: vi.fn(),
}));

vi.mock('@/lib/youtube/services/transcript/vttParser', () => ({
    parseVTT: vi.fn((content: string) => {
        // Simple mock parser - just return some segments
        if (content.includes('WEBVTT')) {
            return [
                { text: 'Test subtitle line 1', startSeconds: 0, durationSeconds: 5 },
                { text: 'Test subtitle line 2', startSeconds: 5, durationSeconds: 5 },
            ];
        }
        return [];
    }),
}));

describe('YouTube Transcript VTT Strategy - Unit Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('[HAPPY PATH] should download and parse VTT subtitle successfully', async () => {
        // Mock successful yt-dlp execution
        (execFile as any).mockResolvedValue({
            stdout: '',
            stderr: '',
        });

        // Mock file system operations
        (fs.mkdir as any).mockResolvedValue(undefined);
        (fs.readdir as any).mockResolvedValue(['dQw4w9WgXcQ.en.vtt']);
        (fs.readFile as any).mockResolvedValue('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nTest subtitle line 1\n\n00:00:05.000 --> 00:00:10.000\nTest subtitle line 2');
        (fs.unlink as any).mockResolvedValue(undefined);

        const result = await ytdlpVttStrategy('dQw4w9WgXcQ', 'en');

        expect(result.source).toBe('ytdlp-vtt');
        expect(result.segments.length).toBeGreaterThan(0);
        expect(result.language).toBe('en');
        expect(result.segments[0].text).toContain('Test subtitle');

        // Verify yt-dlp was called with correct arguments
        expect(execFile).toHaveBeenCalledWith('yt-dlp', expect.arrayContaining([
            '--write-subs',
            '--sub-langs', expect.stringContaining('en'),
            '--extractor-args', 'youtube:player_client=web,android',
            '--user-agent', expect.stringContaining('Mozilla'),
        ]), expect.objectContaining({
            timeout: 60_000,
        }));

        // Verify cleanup was called
        expect(fs.unlink).toHaveBeenCalled();
    });

    it('[FAILURE 1] should throw error when no subtitle file is created', async () => {
        (execFile as any).mockResolvedValue({
            stdout: '',
            stderr: '',
        });

        (fs.mkdir as any).mockResolvedValue(undefined);
        (fs.readdir as any).mockResolvedValue([]);  // No subtitle files created

        await expect(ytdlpVttStrategy('NO_SUBS_VIDEO', 'en'))
            .rejects.toThrow('no subtitle file found');
    });

    it('[FAILURE 2] should throw error on yt-dlp timeout', async () => {
        (execFile as any).mockRejectedValue(new Error('Command timed out after 60000ms'));

        await expect(ytdlpVttStrategy('TIMEOUT_VIDEO', 'en'))
            .rejects.toThrow('timed out');
    });

    it('[FAILURE 3] should handle VTT file with empty segments', async () => {
        // Import and mock parseVTT first before calling ytdlpVttStrategy
        const vttParser = await import('@/lib/youtube/services/transcript/vttParser');
        const parseVTTSpy = vi.spyOn(vttParser, 'parseVTT').mockReturnValueOnce([]);

        (execFile as any).mockResolvedValue({
            stdout: '',
            stderr: '',
        });

        (fs.mkdir as any).mockResolvedValue(undefined);
        (fs.readdir as any).mockResolvedValue(['EMPTY_SUBS.en.vtt']);
        (fs.readFile as any).mockResolvedValue('INVALID VTT CONTENT');  // Will parse to empty
        (fs.unlink as any).mockResolvedValue(undefined);

        await expect(ytdlpVttStrategy('EMPTY_SUBS', 'en'))
            .rejects.toThrow('empty segments');

        parseVTTSpy.mockRestore();
    });

    it('should prefer manual subtitles over auto-generated when both exist', async () => {
        // Mock parseVTT to return valid segments for this test
        const vttParser = await import('@/lib/youtube/services/transcript/vttParser');
        const parseVTTSpy = vi.spyOn(vttParser, 'parseVTT').mockReturnValueOnce([
            { text: 'Manual subtitle', startSeconds: 0, durationSeconds: 5 },
        ]);

        (execFile as any).mockResolvedValue({
            stdout: '',
            stderr: '',
        });

        (fs.mkdir as any).mockResolvedValue(undefined);
        // Return both manual and auto-generated subtitle files
        (fs.readdir as any).mockResolvedValue([
            'dQw4w9WgXcQ.en.orig.vtt',  // auto-generated (contains 'orig')
            'dQw4w9WgXcQ.en.vtt',       // manual
        ]);
        (fs.readFile as any).mockResolvedValue('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nManual subtitle');
        (fs.unlink as any).mockResolvedValue(undefined);

        const result = await ytdlpVttStrategy('dQw4w9WgXcQ', 'en');

        // Should read the manual subtitle (without 'orig')
        expect(fs.readFile).toHaveBeenCalledWith(
            expect.stringContaining('dQw4w9WgXcQ.en.vtt'),
            'utf-8'
        );

        parseVTTSpy.mockRestore();
    });

    it('should fallback to auto-generated subtitles when manual subs fail', async () => {
        // First call (manual subs) fails
        // Second call (auto-generated) succeeds
        (execFile as any)
            .mockRejectedValueOnce(new Error('No manual subtitles'))
            .mockResolvedValueOnce({ stdout: '', stderr: '' });

        (fs.mkdir as any).mockResolvedValue(undefined);
        (fs.readdir as any).mockResolvedValue(['dQw4w9WgXcQ.en.orig.vtt']);
        (fs.readFile as any).mockResolvedValue('WEBVTT\n\n00:00:00.000 --> 00:00:05.000\nAuto-generated subtitle');
        (fs.unlink as any).mockResolvedValue(undefined);

        const result = await ytdlpVttStrategy('dQw4w9WgXcQ', 'en');

        expect(result.source).toBe('ytdlp-vtt');
        expect(execFile).toHaveBeenCalledTimes(2);  // Called twice (manual failed, auto succeeded)
    });
});
