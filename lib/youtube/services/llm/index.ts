import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { encode } from 'gpt-tokenizer';
import { SCRIPT_SYSTEM_PROMPT, TRANSLATION_SYSTEM_PROMPT } from './prompts.js';
import { chunkAndSummarize } from './chunker.js';
import type { TranscriptResult, VideoMetadata, GeneratedScript } from '../../types/youtube.js';

const MAX_INPUT_TOKENS = 150_000;
const MAX_OUTPUT_TOKENS = 8_192;
const ANTHROPIC_MODEL = 'claude-3-5-sonnet-20240620';
const OPENROUTER_MODEL = 'openrouter/free';
const GEMINI_MODEL = 'gemini-2.5-flash';

export async function generateScript(
    transcript: TranscriptResult,
    metadata: VideoMetadata,
    outputLanguage: 'zh-HK' | 'en' | 'zh-TW'
): Promise<GeneratedScript> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    const geminiKey = process.env.GEMINI_API_KEY;

    const hasAnthropic = !!anthropicKey && !anthropicKey.startsWith('your_');
    const hasOpenRouter = !!openRouterKey && !openRouterKey.startsWith('your_');
    const hasGemini = !!geminiKey && !geminiKey.startsWith('your_');

    if (!hasAnthropic && !hasOpenRouter && !hasGemini) {
        throw new Error('Neither ANTHROPIC_API_KEY, OPENROUTER_API_KEY, nor GEMINI_API_KEY is properly set');
    }

    const useGemini = hasGemini;
    const useOpenRouter = !useGemini && hasOpenRouter && !hasAnthropic;

    let processableText = transcript.fullText;

    // If the transcript is too long, summarize it first
    if (transcript.tokenEstimate > MAX_INPUT_TOKENS - 5_000) {
        console.log(`[LLM] Transcript ${transcript.tokenEstimate} tokens — chunking required`);
        processableText = await chunkAndSummarize(transcript.fullText);
    }

    const userMessage = buildUserMessage(metadata, processableText);

    const provider = useGemini ? 'gemini' : (useOpenRouter ? 'openrouter' : 'anthropic');
    const rawScript = await callWithRetry<GeneratedScript>(
        provider,
        SCRIPT_SYSTEM_PROMPT,
        userMessage,
        'script-generation'
    );

    // Inject fields that LLM doesn't know about or might mis-extract
    rawScript.videoId = metadata.id;
    rawScript.channelName = metadata.channelName;
    rawScript.generatedAt = new Date().toISOString();

    // Translate if HK Chinese requested
    if (outputLanguage === 'zh-HK') {
        return translateScript(provider, rawScript);
    }

    return rawScript;
}

async function translateScript(provider: 'anthropic' | 'openrouter' | 'gemini', script: GeneratedScript): Promise<GeneratedScript> {
    const translated = await callWithRetry<GeneratedScript>(
        provider,
        TRANSLATION_SYSTEM_PROMPT,
        JSON.stringify(script),
        'translation'
    );
    return translated;
}

function buildUserMessage(metadata: VideoMetadata, transcriptText: string): string {
    return `VIDEO CONTEXT:
Title: ${metadata.title}
Channel: ${metadata.channelName}
Duration: ${Math.floor(metadata.durationSeconds / 60)} minutes
Categories: ${metadata.categories.join(', ')}
Upload Date: ${metadata.uploadDate}

TRANSCRIPT:
${transcriptText}

Generate the structured script document according to the schema.`;
}

async function callWithRetry<T>(
    provider: 'anthropic' | 'openrouter' | 'gemini',
    systemPrompt: string,
    userMessage: string,
    operationLabel: string,
    maxAttempts = 3
): Promise<T> {

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            if (provider === 'anthropic') {
                const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
                const response = await client.messages.create({
                    model: ANTHROPIC_MODEL,
                    max_tokens: MAX_OUTPUT_TOKENS,
                    system: systemPrompt,
                    messages: [{ role: 'user', content: userMessage }],
                });

                if (response.stop_reason === 'max_tokens') {
                    throw new Error(`Response truncated at max_tokens on attempt ${attempt}`);
                }

                const rawText = response.content
                    .filter(block => block.type === 'text')
                    .map(block => (block as any).text)
                    .join('');

                return parseJSONResponse<T>(rawText, operationLabel);
            } else if (provider === 'gemini') {
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
                const model = genAI.getGenerativeModel({
                    model: GEMINI_MODEL,
                    generationConfig: {
                        responseMimeType: "application/json",
                        maxOutputTokens: MAX_OUTPUT_TOKENS,
                    }
                });

                const response = await model.generateContent([
                    { text: systemPrompt },
                    { text: userMessage }
                ]);

                const rawText = response.response.text();
                return parseJSONResponse<T>(rawText, operationLabel);
            } else {
                const client = new OpenAI({
                    baseURL: 'https://openrouter.ai/api/v1',
                    apiKey: process.env.OPENROUTER_API_KEY!,
                });

                const response = await client.chat.completions.create({
                    model: OPENROUTER_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    response_format: { type: 'json_object' }
                });

                const rawText = response.choices[0].message.content || '';
                return parseJSONResponse<T>(rawText, operationLabel);
            }

        } catch (err: any) {
            console.warn(`[LLM:${operationLabel}] Attempt ${attempt} failed: ${err.message}`);

            const isLastAttempt = attempt === maxAttempts;

            if (err.status === 429) {
                const waitMs = 30_000 * attempt;
                console.warn(`[LLM:${operationLabel}] Rate limited. Waiting ${waitMs / 1000}s...`);
                await sleep(waitMs);
            } else if (!isLastAttempt) {
                await sleep(Math.pow(2, attempt) * 1000);
            }

            if (isLastAttempt) throw err;
        }
    }

    throw new Error(`[LLM:${operationLabel}] All ${maxAttempts} attempts failed`);
}

function parseJSONResponse<T>(raw: string, label: string): T {
    const stripped = raw
        .replace(/^```json\s*/m, '')
        .replace(/^```\s*/m, '')
        .replace(/\s*```$/m, '')
        .trim();

    try {
        return JSON.parse(stripped) as T;
    } catch (err) {
        console.error(`[LLM:${label}] JSON parse failed. Raw output:\n${stripped.slice(0, 500)}`);
        throw new Error(`Invalid JSON from LLM in ${label}: ${err}`);
    }
}

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}
