import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Groq from 'groq-sdk';
import { encode } from 'gpt-tokenizer';
import { SCRIPT_SYSTEM_PROMPT, TRANSLATION_SYSTEM_PROMPT } from './prompts.js';
import { chunkAndSummarize } from './chunker.js';
import type { TranscriptResult, VideoMetadata, GeneratedScript } from '../../types/youtube.js';

const MAX_INPUT_TOKENS = 150_000;
const MAX_OUTPUT_TOKENS = 8_192;
const ANTHROPIC_MODEL = 'claude-3-5-sonnet-20240620';
const OPENROUTER_MODEL = 'openrouter/free';
const GEMINI_MODEL = 'gemini-2.5-flash';
const GROQ_MODEL = 'llama-3.3-70b-versatile';

type LLMProvider = 'anthropic' | 'openrouter' | 'gemini' | 'groq';

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

    const provider = (useGemini ? 'gemini' : (useOpenRouter ? 'openrouter' : 'anthropic')) as LLMProvider;

    let rawScript: GeneratedScript;
    try {
        rawScript = await callWithRetry<GeneratedScript>(
            provider,
            SCRIPT_SYSTEM_PROMPT,
            userMessage,
            'script-generation'
        );
    } catch (err) {
        if (provider !== 'groq' && !!process.env.GROQ_API_KEY) {
            console.warn(`[LLM] Primary provider ${provider} failed. Falling back to Groq...`);
            rawScript = await callWithRetry<GeneratedScript>(
                'groq',
                SCRIPT_SYSTEM_PROMPT,
                userMessage,
                'script-generation-fallback'
            );
        } else {
            throw err;
        }
    }

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

async function translateScript(provider: LLMProvider, script: GeneratedScript): Promise<GeneratedScript> {
    try {
        const translated = await callWithRetry<GeneratedScript>(
            provider,
            TRANSLATION_SYSTEM_PROMPT,
            JSON.stringify(script),
            'translation'
        );
        return translated;
    } catch (err) {
        if (provider !== 'groq' && !!process.env.GROQ_API_KEY) {
            console.warn(`[LLM] Translation with ${provider} failed. Falling back to Groq...`);
            return await callWithRetry<GeneratedScript>(
                'groq',
                TRANSLATION_SYSTEM_PROMPT,
                JSON.stringify(script),
                'translation-fallback'
            );
        }
        throw err;
    }
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
    provider: LLMProvider,
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
            } else if (provider === 'groq') {
                const client = new Groq({ apiKey: process.env.GROQ_API_KEY! });
                const response = await client.chat.completions.create({
                    model: GROQ_MODEL,
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userMessage }
                    ],
                    response_format: { type: 'json_object' }
                });
                const rawText = response.choices[0].message.content || '';
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

            // If we are about to fail and it's a rate limit, maybe we should skip remaining retries
            // if we are going to fallback anyway. But for now we stick to user request: 
            // fallback after primary exhausted.

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
        console.error(`[LLM:${label}] Primary JSON parse failed. Length: ${stripped.length}. Error: ${err}`);

        // Simple attempt to repair truncated JSON (common with long LLM outputs)
        try {
            let repaired = stripped;
            // If it ends with a property name or partial value, try closing it
            if (!repaired.endsWith('}') && !repaired.endsWith(']')) {
                console.warn(`[LLM:${label}] Attempting truncated JSON repair...`);
                // Very basic heuristic: if it looks like it's in the middle of a string, add quote and braces
                if ((repaired.match(/"/g) || []).length % 2 !== 0) repaired += '"';

                // Add closing braces until it might parse
                let attempts = 0;
                while (attempts < 10) {
                    try {
                        return JSON.parse(repaired + '}'.repeat(attempts)) as T;
                    } catch {
                        attempts++;
                    }
                }
            }
        } catch (repairErr) {
            console.error(`[LLM:${label}] JSON repair also failed.`);
        }

        console.error(`[LLM:${label}] Final Raw output snippet:\n${stripped.slice(-1000)}`);
        throw new Error(`Invalid JSON from LLM in ${label}: ${err}`);
    }
}

function sleep(ms: number) {
    return new Promise(r => setTimeout(r, ms));
}
