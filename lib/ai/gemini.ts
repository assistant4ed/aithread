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
            const modelName = options?.model || this.defaultModel;
            const model = this.genAI.getGenerativeModel({
                model: modelName,
                generationConfig: {
                    temperature: options?.temperature ?? 0.1,
                    maxOutputTokens: options?.max_tokens,
                    responseMimeType: options?.response_format?.type === 'json_object' ? 'application/json' : 'text/plain',
                }
            });

            // Extract system message if present
            const systemMessage = messages.find(m => m.role === 'system');
            const chatMessages = messages.filter(m => m.role !== 'system');

            // Format history for Gemini (excluding the last message which we'll send as the prompt)
            const history = chatMessages.slice(0, -1).map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }] as Part[],
            }));

            const lastMessage = chatMessages[chatMessages.length - 1];

            // If there's a system message, we either use it in model configuration (newer SDKs)
            // or prepended to the first message. For simplicity and broad compatibility:
            let promptContent = lastMessage.content;

            const chat = model.startChat({
                history,
                systemInstruction: systemMessage?.content,
            });

            const result = await chat.sendMessage(promptContent);
            const response = await result.response;
            return response.text() || null;
        } catch (e) {
            console.error("[GeminiProvider] Error:", e);
            return null;
        }
    }
}
