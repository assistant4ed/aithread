export interface AIChatMessage {
    role: "system" | "user" | "assistant";
    content: string | any[];
}

export interface AIChatOptions {
    model?: string;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: "json_object" };
}

export interface AIProvider {
    createChatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string | null>;
}

export class FallbackProvider implements AIProvider {
    constructor(private providers: AIProvider[]) { }

    async createChatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string | null> {
        for (const provider of this.providers) {
            try {
                const result = await provider.createChatCompletion(messages, options);
                if (result) return result;
            } catch (e) {
                console.error("[FallbackProvider] Step failed:", e);
            }
        }
        return null;
    }
}

export interface ProviderConfig {
    provider: string;
    model: string;
    apiKey?: string;
}

import { GroqProvider } from "./groq";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";
import { GeminiProvider } from "./gemini";

export function getProvider(config: ProviderConfig): AIProvider {
    const primary = _createProvider(config);

    // If it's a critical step, we can wrap it in a fallback
    // For now, let's allow returning a single provider, 
    // but the caller can now use FallbackProvider if they want.
    return primary;
}

function _createProvider(config: ProviderConfig): AIProvider {
    switch (config.provider.toUpperCase()) {
        case "GROQ":
            return new GroqProvider(config.apiKey || process.env.GROQ_API_KEY || "", config.model);
        case "OPENAI":
            return new OpenAIProvider(config.apiKey || process.env.OPENAI_API_KEY || "", config.model);
        case "CLAUDE":
            return new AnthropicProvider(config.apiKey || process.env.ANTHROPIC_API_KEY || "", config.model);
        case "GEMINI":
            return new GeminiProvider(config.apiKey || process.env.GEMINI_API_KEY || "", config.model);
        default:
            throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
}
