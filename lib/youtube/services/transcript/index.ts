import { encode } from 'gpt-tokenizer';
import type { VideoMetadata, TranscriptResult } from '../../types/youtube.js';
import { captionApiStrategy } from './captionStrategy.js';
import { ytdlpVttStrategy } from './ytdlpStrategy.js';
import { whisperStrategy } from './whisperStrategy.js';

const PREFERRED_LANGUAGES = ['zh-Hant', 'zh-TW', 'zh', 'en'];

export async function extractTranscript(
    videoId: string,
    metadata: VideoMetadata
): Promise<TranscriptResult> {

    // Determine preferred language for this video
    const targetLang = selectBestLanguage(metadata.availableCaptionLanguages);

    console.log(`[Transcript] Video: ${videoId} | Available langs: ${metadata.availableCaptionLanguages.join(', ')} | Target: ${targetLang}`);

    // Strategy 1: youtube-transcript npm package
    if (metadata.hasManualCaptions || metadata.hasAutoCaptions) {
        try {
            const result = await captionApiStrategy(videoId, targetLang);
            console.log(`[Transcript] Strategy 1 succeeded (${result.segments.length} segments)`);
            return enrichResult(result);
        } catch (err: any) {
            console.warn(`[Transcript] Strategy 1 failed: ${err.message}`);
        }
    }

    // Strategy 2: yt-dlp VTT download
    try {
        const result = await ytdlpVttStrategy(videoId, targetLang);
        console.log(`[Transcript] Strategy 2 succeeded via yt-dlp VTT`);
        return enrichResult(result);
    } catch (err: any) {
        console.warn(`[Transcript] Strategy 2 failed: ${err.message}`);
    }

    // Strategy 3: Audio download + Whisper
    console.warn(`[Transcript] Falling back to Whisper for ${videoId} — this will cost money and take time`);
    const result = await whisperStrategy(videoId, metadata.durationSeconds);
    console.log(`[Transcript] Strategy 3 (Whisper) succeeded`);
    return enrichResult(result);
}

function selectBestLanguage(available: string[]): string {
    for (const lang of PREFERRED_LANGUAGES) {
        if (available.some(a => a.startsWith(lang))) return lang;
    }
    // Fall back to whatever is first available
    return available[0] ?? 'en';
}

function enrichResult(result: TranscriptResult): TranscriptResult {
    const fullText = result.segments.map(s => s.text).join(' ');
    return {
        ...result,
        fullText,
        tokenEstimate: encode(fullText).length,
    };
}
