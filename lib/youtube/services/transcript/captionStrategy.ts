import { YoutubeTranscript } from 'youtube-transcript';
import type { TranscriptResult } from '../../types/youtube.js';

export async function captionApiStrategy(
    videoId: string,
    preferredLang: string
): Promise<TranscriptResult> {

    // Try preferred language first, then English as universal fallback
    const langsToTry = [preferredLang, 'en'].filter(Boolean);

    let lastError: Error | null = null;

    for (const lang of langsToTry) {
        try {
            // @ts-ignore - youtube-transcript types might be slightly outdated or strict
            const rawSegments = await YoutubeTranscript.fetchTranscript(videoId, { lang });

            if (!rawSegments || rawSegments.length === 0) {
                throw new Error('Empty transcript returned');
            }

            return {
                segments: rawSegments.map(s => ({
                    text: s.text.replace(/\n/g, ' ').trim(),
                    startSeconds: s.offset / 1000,
                    durationSeconds: s.duration / 1000,
                })),
                fullText: '',          // enriched by coordinator
                language: lang,
                source: 'caption-api',
                tokenEstimate: 0,     // enriched by coordinator
            };
        } catch (err: any) {
            lastError = err;
            // Don't throw immediately — try next language
        }
    }

    throw lastError ?? new Error('All caption API language attempts failed');
}
