export interface AIChatMessage {
    role: "system" | "user" | "assistant";
    content: string;
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

export interface ProviderConfig {
    provider: string;
    model: string;
    apiKey?: string;
}

import { GroqProvider } from "./groq";
import { OpenAIProvider } from "./openai";
import { AnthropicProvider } from "./anthropic";

export function getProvider(config: ProviderConfig): AIProvider {
    switch (config.provider.toUpperCase()) {
        case "GROQ":
            return new GroqProvider(config.apiKey || process.env.GROQ_API_KEY || "", config.model);
        case "OPENAI":
            return new OpenAIProvider(config.apiKey || process.env.OPENAI_API_KEY || "", config.model);
        case "CLAUDE":
            return new AnthropicProvider(config.apiKey || process.env.ANTHROPIC_API_KEY || "", config.model);
        default:
            throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
}
