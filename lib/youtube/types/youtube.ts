export interface VideoMetadata {
    id: string;
    title: string;
    description: string;
    channelName: string;
    channelUrl: string;
    uploadDate: string;         // YYYYMMDD from yt-dlp
    durationSeconds: number;
    viewCount: number;
    likeCount: number | null;   // YouTube hides likes — plan for null
    thumbnailUrl: string;
    tags: string[];
    categories: string[];
    language: string | null;    // null = yt-dlp couldn't detect
    hasManualCaptions: boolean;
    hasAutoCaptions: boolean;
    availableCaptionLanguages: string[];
}

export interface TranscriptSegment {
    text: string;
    startSeconds: number;
    durationSeconds: number;
}

export interface TranscriptResult {
    segments: TranscriptSegment[];
    fullText: string;           // pre-joined for LLM consumption
    language: string;
    source: 'caption-api' | 'ytdlp-vtt' | 'whisper';
    tokenEstimate: number;
}

export interface ScriptChapter {
    heading: string;
    timestampStart: string;     // "MM:SS" format
    keyPoints: string[];
    actionItems: string[];
    notableQuotes: string[];    // max 2, only truly remarkable lines
    toolsMentioned: string[];   // useful for tutorial content
}

export interface GeneratedScript {
    videoId: string;
    title: string;
    channelName: string;
    oneLinerSummary: string;
    targetAudience: string;
    difficultyLevel: 'beginner' | 'intermediate' | 'advanced' | 'mixed';
    estimatedReadTime: number;  // minutes
    chapters: ScriptChapter[];
    overallTakeaways: string[];
    prerequisites: string[];
    relatedTopics: string[];
    generatedAt: string;
}

export interface PDFGenerationResult {
    filePath: string;
    fileSizeBytes: number;
    pageCount: number;          // Puppeteer doesn't easily give this — estimate
}

// The job payload shape — what gets enqueued into BullMQ
export interface YouTubeJobPayload {
    videoUrl: string;
    requestedBy?: string;       // useful for tracking who triggered it
    outputLanguage: 'zh-HK' | 'en' | 'zh-TW';
    includeFrames: boolean;
    sheetsRowIndex?: number;    // if triggered from Sheets, write result back
}
