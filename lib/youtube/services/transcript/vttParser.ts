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
    const result: TranscriptSegment[] = [];
    for (let i = 0; i < segments.length; i++) {
        const curr = segments[i];
        const next = segments[i + 1];
        if (next) {
            // Check for overlap: does curr end with some prefix of next?
            let overlapLength = 0;
            const maxOverlap = Math.min(curr.text.length, next.text.length);
            for (let j = 1; j <= maxOverlap; j++) {
                if (curr.text.slice(-j) === next.text.slice(0, j)) {
                    overlapLength = j;
                }
            }

            if (overlapLength > 0) {
                // They overlap. Append the non-overlapping prefix of curr to the result,
                // and let the next segment carry the rest to preserve characters.
                const nonOverlapping = curr.text.slice(0, -overlapLength).trim();
                if (nonOverlapping) {
                    result.push({
                        ...curr,
                        text: nonOverlapping
                    });
                }
                continue;
            }
        }
        result.push(curr);
    }
    return result;
}
