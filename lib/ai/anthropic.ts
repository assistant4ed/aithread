import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIChatMessage, AIChatOptions } from './provider';

export class AnthropicProvider implements AIProvider {
    private client: Anthropic;
    private defaultModel: string;

    constructor(apiKey: string, defaultModel: string = "claude-3-5-sonnet-20241022") {
        this.client = new Anthropic({ apiKey });
        this.defaultModel = defaultModel;
    }

    async createChatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string | null> {
        try {
            const systemMessage = messages.find(m => m.role === 'system');
            const userMessages = messages.filter(m => m.role !== 'system');

            const response = await this.client.messages.create({
                model: options?.model || this.defaultModel,
                max_tokens: options?.max_tokens || 1024,
                temperature: options?.temperature ?? 0.1,
                messages: userMessages.map(m => ({
                    role: m.role as 'user' | 'assistant',
                    content: m.content
                })),
                system: systemMessage?.content
            });

            const content = response.content[0];
            return content.type === 'text' ? content.text : null;
        } catch (e) {
            console.error("[AnthropicProvider] Error:", e);
            return null;
        }
    }
}
