/**
 * YouTube Transcript Extraction Verification — Live Pipeline Test
 *
 * Runs 5 sequential checks against a real YouTube video:
 *   1. System Dependencies — yt-dlp and ffmpeg binaries exist
 *   2. Metadata Extraction — extractMetadata returns valid VideoMetadata
 *   3. Transcript Strategy 1 — Caption API (youtube-transcript npm)
 *   4. Transcript Strategy 2 — yt-dlp VTT download + parse
 *   5. Transcript Orchestrator — Full 3-tier fallback pipeline
 *
 * Usage:
 *   npx tsx scripts/verify_youtube.ts
 *   npx tsx scripts/verify_youtube.ts "https://www.youtube.com/watch?v=<id>"
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import { extractMetadata, extractVideoId } from '../lib/youtube/services/metadata.js';
import { extractTranscript } from '../lib/youtube/services/transcript/index.js';
import { captionApiStrategy } from '../lib/youtube/services/transcript/captionStrategy.js';
import { ytdlpVttStrategy } from '../lib/youtube/services/transcript/ytdlpStrategy.js';
import type { VideoMetadata } from '../lib/youtube/types/youtube.js';

const execFileAsync = promisify(execFile);

// Default: a popular TED talk with reliable captions
const DEFAULT_VIDEO_URL = 'https://www.youtube.com/watch?v=UF8uR6Z6KLc'; // Steve Jobs Stanford speech

// ─── Formatting ──────────────────────────────────────────────────────────────

function header(title: string) {
    const line = '═'.repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(`${line}\n`);
}

function pass(msg: string) { console.log(`  [PASS] ${msg}`); }
function fail(msg: string) { console.log(`  [FAIL] ${msg}`); }
function info(msg: string) { console.log(`  [INFO] ${msg}`); }
function warn(msg: string) { console.log(`  [WARN] ${msg}`); }

let passed = 0;
let failed = 0;

function check(condition: boolean, passMsg: string, failMsg: string) {
    if (condition) {
        pass(passMsg);
        passed++;
    } else {
        fail(failMsg);
        failed++;
    }
}

// ─── CHECK 1: System Dependencies ───────────────────────────────────────────

async function checkSystemDependencies() {
    header('CHECK 1 — SYSTEM DEPENDENCIES');

    // 1a. yt-dlp
    try {
        const { stdout } = await execFileAsync('yt-dlp', ['--version'], {
            timeout: 10_000,
            env: { ...process.env, PATH: `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}` },
        });
        const version = stdout.trim();
        check(version.length > 0, `yt-dlp found: v${version}`, 'yt-dlp returned empty version');
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            fail('yt-dlp binary not found — install with: brew install yt-dlp');
        } else {
            fail(`yt-dlp --version failed: ${err.message}`);
        }
        failed++;
    }

    // 1b. ffmpeg
    try {
        const { stdout } = await execFileAsync('ffmpeg', ['-version'], {
            timeout: 10_000,
            env: { ...process.env, PATH: `/home/linuxbrew/.linuxbrew/bin:${process.env.PATH}` },
        });
        const firstLine = stdout.split('\n')[0] || '';
        const versionMatch = firstLine.match(/ffmpeg version (\S+)/);
        check(!!versionMatch, `ffmpeg found: ${versionMatch?.[1] || firstLine.slice(0, 60)}`, 'ffmpeg returned unexpected output');
    } catch (err: any) {
        if (err.code === 'ENOENT') {
            fail('ffmpeg binary not found — install with: brew install ffmpeg');
        } else {
            fail(`ffmpeg -version failed: ${err.message}`);
        }
        failed++;
    }
}

// ─── CHECK 2: Metadata Extraction ───────────────────────────────────────────

let metadata: VideoMetadata | null = null;

async function checkMetadataExtraction(videoUrl: string) {
    header('CHECK 2 — METADATA EXTRACTION');

    info(`Video URL: ${videoUrl}`);

    // 2a. Extract video ID
    let videoId: string;
    try {
        videoId = extractVideoId(videoUrl);
        check(videoId.length === 11, `Video ID extracted: ${videoId}`, `Unexpected video ID length: ${videoId}`);
    } catch (err: any) {
        fail(`extractVideoId failed: ${err.message}`);
        failed++;
        return;
    }

    // 2b. Extract full metadata via yt-dlp
    try {
        metadata = await extractMetadata(videoUrl);

        check(metadata.id === videoId, `Metadata ID matches: ${metadata.id}`, `ID mismatch: expected ${videoId}, got ${metadata.id}`);
        check(metadata.title.length > 0, `Title: "${metadata.title.slice(0, 60)}"`, 'Title is empty');
        check(metadata.channelName.length > 0, `Channel: ${metadata.channelName}`, 'Channel name is empty');
        check(metadata.durationSeconds > 0, `Duration: ${metadata.durationSeconds}s (${Math.round(metadata.durationSeconds / 60)}min)`, 'Duration is 0 or negative');

        // Report caption availability
        info(`Manual captions: ${metadata.hasManualCaptions}`);
        info(`Auto captions: ${metadata.hasAutoCaptions}`);
        info(`Caption languages: ${metadata.availableCaptionLanguages.slice(0, 10).join(', ')}${metadata.availableCaptionLanguages.length > 10 ? ` (+${metadata.availableCaptionLanguages.length - 10} more)` : ''}`);
    } catch (err: any) {
        fail(`extractMetadata failed: ${err.message}`);
        failed++;
    }
}

// ─── CHECK 3: Transcript Strategy 1 (Caption API) ──────────────────────────

async function checkCaptionApiStrategy(videoUrl: string) {
    header('CHECK 3 — TRANSCRIPT STRATEGY 1 (CAPTION API)');

    const videoId = extractVideoId(videoUrl);
    const targetLang = 'en';

    try {
        const result = await captionApiStrategy(videoId, targetLang);

        check(
            Array.isArray(result.segments) && result.segments.length > 0,
            `Returned ${result.segments.length} segments`,
            'No segments returned'
        );

        if (result.segments.length > 0) {
            const firstSeg = result.segments[0];
            check(
                typeof firstSeg.text === 'string' && firstSeg.text.length > 0,
                `First segment: "${firstSeg.text.slice(0, 50)}..."`,
                'First segment has no text'
            );
            check(
                typeof firstSeg.startSeconds === 'number',
                `Segment timing present (start: ${firstSeg.startSeconds.toFixed(1)}s)`,
                'Segment missing startSeconds'
            );
            check(
                typeof firstSeg.durationSeconds === 'number',
                `Segment duration present (${firstSeg.durationSeconds.toFixed(1)}s)`,
                'Segment missing durationSeconds'
            );

            const totalText = result.segments.map(s => s.text).join(' ');
            check(
                totalText.length > 100,
                `Total text length: ${totalText.length} chars`,
                `Total text too short: ${totalText.length} chars (expected >100)`
            );
        }

        check(result.source === 'caption-api', `Source: ${result.source}`, `Unexpected source: ${result.source}`);
        info(`Language: ${result.language}`);
    } catch (err: any) {
        warn(`Caption API strategy failed (expected for some videos): ${err.message}`);
        info('This is non-fatal — the orchestrator will fall back to other strategies');
    }
}

// ─── CHECK 4: Transcript Strategy 2 (yt-dlp VTT) ───────────────────────────

async function checkYtdlpVttStrategy(videoUrl: string) {
    header('CHECK 4 — TRANSCRIPT STRATEGY 2 (YT-DLP VTT)');

    const videoId = extractVideoId(videoUrl);
    const targetLang = 'en';

    try {
        const result = await ytdlpVttStrategy(videoId, targetLang);

        check(
            Array.isArray(result.segments) && result.segments.length > 0,
            `Returned ${result.segments.length} segments`,
            'No segments returned'
        );

        if (result.segments.length > 0) {
            const firstSeg = result.segments[0];
            check(
                typeof firstSeg.text === 'string' && firstSeg.text.length > 0,
                `First segment: "${firstSeg.text.slice(0, 50)}..."`,
                'First segment has no text'
            );

            const totalText = result.segments.map(s => s.text).join(' ');
            check(
                totalText.length > 100,
                `Total text length: ${totalText.length} chars`,
                `Total text too short: ${totalText.length} chars (expected >100)`
            );
        }

        check(result.source === 'ytdlp-vtt', `Source: ${result.source}`, `Unexpected source: ${result.source}`);
        info(`Language: ${result.language}`);
    } catch (err: any) {
        warn(`yt-dlp VTT strategy failed: ${err.message}`);
        info('This is non-fatal — the orchestrator will fall back to Whisper if needed');
    }
}

// ─── CHECK 5: Transcript Orchestrator (Full Pipeline) ───────────────────────

async function checkTranscriptOrchestrator(videoUrl: string) {
    header('CHECK 5 — TRANSCRIPT ORCHESTRATOR (FULL PIPELINE)');

    if (!metadata) {
        fail('Skipped — metadata extraction failed in CHECK 2');
        failed++;
        return;
    }

    const videoId = extractVideoId(videoUrl);

    try {
        const result = await extractTranscript(videoId, metadata);

        check(
            result.fullText.length > 100,
            `Full text: ${result.fullText.length} chars`,
            `Full text too short: ${result.fullText.length} chars (expected >100)`
        );

        const validSources = ['caption-api', 'ytdlp-vtt', 'whisper'] as const;
        check(
            (validSources as readonly string[]).includes(result.source),
            `Strategy used: ${result.source}`,
            `Unknown source: ${result.source}`
        );

        check(
            result.tokenEstimate > 0,
            `Token estimate: ${result.tokenEstimate}`,
            `Token estimate is 0 — enrichResult may not be working`
        );

        check(
            result.segments.length > 0,
            `Segments: ${result.segments.length}`,
            'No segments in orchestrator result'
        );

        info(`Language: ${result.language}`);
        info(`Preview: "${result.fullText.slice(0, 120)}..."`);
    } catch (err: any) {
        fail(`extractTranscript failed: ${err.message}`);
        failed++;
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    const videoUrl = process.argv[2] || DEFAULT_VIDEO_URL;

    header('YOUTUBE TRANSCRIPT EXTRACTION VERIFICATION');
    info(`Timestamp: ${new Date().toISOString()}`);
    info(`Target video: ${videoUrl}`);

    await checkSystemDependencies();
    await checkMetadataExtraction(videoUrl);
    await checkCaptionApiStrategy(videoUrl);
    await checkYtdlpVttStrategy(videoUrl);
    await checkTranscriptOrchestrator(videoUrl);

    // Summary
    header('SUMMARY');
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total:  ${passed + failed}\n`);

    if (failed > 0) {
        console.log('  ⚠ Some checks failed — review above.\n');
    } else {
        console.log('  ✓ All YouTube pipeline checks passed.\n');
    }

    process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
    console.error('Fatal error:', e);
    process.exit(2);
});
