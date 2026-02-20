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
import { OpenRouter } from "./openrouter";

export function getProvider(config: ProviderConfig): AIProvider {
    switch (config.provider.toUpperCase()) {
        case "GROQ":
            return new GroqProvider(config.apiKey || process.env.GROQ_API_KEY || "", config.model);
        case "OPENROUTER":
            return new OpenRouter(config.apiKey || process.env.OPENROUTER_API_KEY || "", config.model);
        default:
            throw new Error(`Unsupported AI provider: ${config.provider}`);
    }
}
