import { GoogleGenerativeAI, Part } from "@google/generative-ai";
import { AIProvider, AIChatMessage, AIChatOptions } from "./provider";

export class GeminiProvider implements AIProvider {
    private genAI: GoogleGenerativeAI;
    private defaultModel: string;

    constructor(apiKey: string, defaultModel: string = "gemini-2.5-flash") {
        this.genAI = new GoogleGenerativeAI(apiKey);
        this.defaultModel = defaultModel;
    }

    async createChatCompletion(messages: AIChatMessage[], options?: AIChatOptions): Promise<string | null> {
        try {
            const systemMessage = messages.find(m => m.role === 'system');
            const chatMessages = messages.filter(m => m.role !== 'system');

            const modelName = options?.model || this.defaultModel;
            const modelConfig: any = {
                model: modelName,
                generationConfig: {
                    temperature: options?.temperature ?? 0.1,
                    maxOutputTokens: options?.max_tokens,
                    responseMimeType: options?.response_format?.type === 'json_object' ? 'application/json' : 'text/plain',
                }
            };

            if (systemMessage?.content) {
                modelConfig.systemInstruction = typeof systemMessage.content === 'string' ? systemMessage.content : JSON.stringify(systemMessage.content);
            }

            const model = this.genAI.getGenerativeModel(modelConfig);

            // Format history for Gemini (excluding the last message which we'll send as the prompt)
            const history = chatMessages.slice(0, -1).map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }] as Part[],
            }));

            const lastMessage = chatMessages[chatMessages.length - 1];

            // For Gemini, prompt must be the last user message
            let promptContent = typeof lastMessage.content === 'string' ? lastMessage.content : JSON.stringify(lastMessage.content);

            const chat = model.startChat({
                history
            });

            const result = await chat.sendMessage(promptContent);
            const response = await result.response;
            return response.text() || null;
        } catch (e: any) {
            console.warn(`[GeminiProvider] Error: ${e.message || e}`);
            return null;
        }
    }
}
