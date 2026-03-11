import OpenAI from "openai";
import { AIProvider, AIChatMessage, AIChatOptions } from "./provider";

export class OpenRouterProvider implements AIProvider {
    private client: OpenAI;
    private defaultModel: string;

    constructor(apiKey: string, defaultModel: string = "qwen/qwen3.5-35b-a3b") {
        this.client = new OpenAI({
            baseURL: "https://openrouter.ai/api/v1",
            apiKey,
        });
        this.defaultModel = defaultModel;
    }

    async createChatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string | null> {
        try {
            const completion = await this.client.chat.completions.create({
                messages: messages as any,
                model: options?.model || this.defaultModel,
                temperature: options?.temperature ?? 0.1,
                max_tokens: options?.max_tokens,
                response_format: options?.response_format as any,
            });

            return completion.choices[0]?.message?.content || null;
        } catch (e) {
            console.error("[OpenRouterProvider] Error:", e);
            return null;
        }
    }
}
