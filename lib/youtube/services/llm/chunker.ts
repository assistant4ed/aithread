import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { encode } from 'gpt-tokenizer';

// Target: each chunk is ~30k tokens — safe for input + output
const CHUNK_TOKEN_SIZE = 28_000;
const WORDS_PER_TOKEN_ESTIMATE = 0.75; // rough English heuristic

const CHUNK_SUMMARIZE_SYSTEM = `You are a content summarizer.
Summarize the provided transcript segment preserving:
- All specific steps, instructions, or procedures
- Tool and technology names
- Key principles or frameworks
- Any direct quotes that seem significant
- Timestamps if present

Write in dense, information-rich prose. Do not editorialize.
Output plain text only — no JSON, no headers, no bullets.`;

export async function chunkAndSummarize(fullText: string): Promise<string> {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    const openRouterKey = process.env.OPENROUTER_API_KEY;

    const hasAnthropic = !!anthropicKey && !anthropicKey.startsWith('your_');
    const hasOpenRouter = !!openRouterKey && !openRouterKey.startsWith('your_');

    if (!hasAnthropic && !hasOpenRouter) {
        throw new Error('Neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY is properly set');
    }

    const useOpenRouter = hasOpenRouter && !hasAnthropic;

    const words = fullText.split(/\s+/);
    const wordsPerChunk = Math.floor(CHUNK_TOKEN_SIZE * WORDS_PER_TOKEN_ESTIMATE);

    const chunks: string[] = [];
    for (let i = 0; i < words.length; i += wordsPerChunk) {
        chunks.push(words.slice(i, i + wordsPerChunk).join(' '));
    }

    if (chunks.length <= 1) return fullText;

    console.log(`[Chunker] Splitting transcript into ${chunks.length} chunks via ${useOpenRouter ? 'OpenRouter' : 'Anthropic'}`);

    const summaries: string[] = [];
    for (let i = 0; i < chunks.length; i++) {
        console.log(`[Chunker] Summarizing chunk ${i + 1}/${chunks.length}`);

        let text = '';
        if (useOpenRouter) {
            const client = new OpenAI({
                baseURL: 'https://openrouter.ai/api/v1',
                apiKey: process.env.OPENROUTER_API_KEY!,
            });
            const response = await client.chat.completions.create({
                model: 'openrouter/free',
                messages: [
                    { role: 'system', content: CHUNK_SUMMARIZE_SYSTEM },
                    { role: 'user', content: `TRANSCRIPT SEGMENT (Part ${i + 1} of ${chunks.length}):\n\n${chunks[i]}` }
                ],
            });
            text = response.choices[0].message.content || '';
        } else {
            const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
            const response = await client.messages.create({
                model: 'claude-3-haiku-20240307',
                max_tokens: 2048,
                system: CHUNK_SUMMARIZE_SYSTEM,
                messages: [{
                    role: 'user',
                    content: `TRANSCRIPT SEGMENT (Part ${i + 1} of ${chunks.length}):\n\n${chunks[i]}`,
                }],
            });
            text = response.content
                .filter(b => b.type === 'text')
                .map(b => (b as any).text)
                .join('');
        }

        summaries.push(`[PART ${i + 1}]\n${text}`);
    }

    const combined = summaries.join('\n\n---\n\n');
    const finalTokens = encode(combined).length;
    console.log(`[Chunker] Combined summary: ${finalTokens} tokens (was ${encode(fullText).length})`);

    return combined;
}
