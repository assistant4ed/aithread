import type { TranscriptSegment } from '../../types/youtube.js';

export function parseVTT(raw: string): TranscriptSegment[] {
    const lines = raw.split('\n');
    const segments: TranscriptSegment[] = [];

    let i = 0;
    while (i < lines.length) {
        const line = lines[i].trim();

        // Detect timestamp line: "00:00:01.234 --> 00:00:03.567"
        const timestampMatch = line.match(
            /(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[\.,]\d{3})/
        );

        if (timestampMatch) {
            const startSeconds = parseTimestamp(timestampMatch[1]);
            const endSeconds = parseTimestamp(timestampMatch[2]);

            // Collect text lines until blank line or next timestamp
            const textLines: string[] = [];
            i++;
            while (i < lines.length && lines[i].trim() !== '' && !lines[i].match(/-->/)) {
                const cleaned = cleanVTTLine(lines[i]);
                if (cleaned) textLines.push(cleaned);
                i++;
            }

            const text = textLines.join(' ').trim();
            if (text) {
                segments.push({
                    text,
                    startSeconds,
                    durationSeconds: endSeconds - startSeconds,
                });
            }
        } else {
            i++;
        }
    }

    // YouTube auto-captions have duplicate/overlapping cues due to rolling-window generation
    // Deduplicate consecutive segments with identical text
    return deduplicateSegments(segments);
}

function cleanVTTLine(line: string): string {
    return line
        .replace(/<[^>]+>/g, '')     // strip <c>, <i>, <b>, timestamp tags
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ')
        .replace(/\[.*?\]/g, '')     // remove [Music], [Applause], [Laughter]
        .replace(/\s+/g, ' ')
        .trim();
}

function parseTimestamp(ts: string): number {
    // Handles both HH:MM:SS.mmm and MM:SS.mmm
    const parts = ts.replace(',', '.').split(':').map(Number);
    if (parts.length === 3) {
        return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return parts[0] * 60 + parts[1];
}

function deduplicateSegments(segments: TranscriptSegment[]): TranscriptSegment[] {
    const seen = new Set<string>();
    return segments.filter(seg => {
        // Normalize for comparison: lowercase, strip punctuation
        const normalized = seg.text.toLowerCase().replace(/[^\w\s]/g, '').trim();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });
}
