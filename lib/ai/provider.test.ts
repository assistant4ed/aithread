import { describe, it, expect, vi, beforeEach } from "vitest";
import {
    FallbackProvider,
    getProvider,
    AIProvider,
    AIChatMessage,
} from "./provider";

// ─── FallbackProvider ─────────────────────────────────────────────────────────

describe("FallbackProvider", () => {
    function mockProvider(result: string | null, shouldThrow = false): AIProvider {
        return {
            createChatCompletion: shouldThrow
                ? vi.fn().mockRejectedValue(new Error("Provider error"))
                : vi.fn().mockResolvedValue(result),
        };
    }

    const messages: AIChatMessage[] = [{ role: "user", content: "Hello" }];

    it("returns result from first provider when it succeeds", async () => {
        const p1 = mockProvider("PONG");
        const p2 = mockProvider("FALLBACK");
        const fallback = new FallbackProvider([p1, p2]);

        const result = await fallback.createChatCompletion(messages);
        expect(result).toBe("PONG");
        expect(p2.createChatCompletion).not.toHaveBeenCalled();
    });

    it("tries second provider when first returns null", async () => {
        const p1 = mockProvider(null);
        const p2 = mockProvider("FALLBACK");
        const fallback = new FallbackProvider([p1, p2]);

        const result = await fallback.createChatCompletion(messages);
        expect(result).toBe("FALLBACK");
    });

    it("returns null when all providers return null", async () => {
        const p1 = mockProvider(null);
        const p2 = mockProvider(null);
        const fallback = new FallbackProvider([p1, p2]);

        const result = await fallback.createChatCompletion(messages);
        expect(result).toBeNull();
    });

    it("returns null when all providers throw errors", async () => {
        const p1 = mockProvider(null, true);
        const p2 = mockProvider(null, true);
        const fallback = new FallbackProvider([p1, p2]);

        const result = await fallback.createChatCompletion(messages);
        expect(result).toBeNull();
    });

    it("continues through mix of errors and nulls to find result", async () => {
        const p1 = mockProvider(null, true); // throws
        const p2 = mockProvider(null);       // returns null
        const p3 = mockProvider("SUCCESS");  // succeeds
        const fallback = new FallbackProvider([p1, p2, p3]);

        const result = await fallback.createChatCompletion(messages);
        expect(result).toBe("SUCCESS");
    });

    it("catches 403 errors identically to any other error (gap: silent swallowing)", async () => {
        const error403 = new Error("Request failed with status code 403");
        const p1: AIProvider = {
            createChatCompletion: vi.fn().mockRejectedValue(error403),
        };
        const p2 = mockProvider("RECOVERED");
        const fallback = new FallbackProvider([p1, p2]);

        // The 403 is silently caught — no way to distinguish from timeout/500/etc.
        const result = await fallback.createChatCompletion(messages);
        expect(result).toBe("RECOVERED");
        expect(p1.createChatCompletion).toHaveBeenCalled();
    });
});

// ─── getProvider factory ──────────────────────────────────────────────────────

const mockGroq = vi.fn();
const mockOpenAI = vi.fn();
const mockAnthropic = vi.fn();
const mockGemini = vi.fn();

vi.mock("./groq", () => ({
    GroqProvider: class {
        _type = "groq";
        apiKey: string;
        model: string;
        constructor(apiKey: string, model: string) {
            this.apiKey = apiKey;
            this.model = model;
            mockGroq(apiKey, model);
        }
        createChatCompletion = vi.fn();
    },
}));

vi.mock("./openai", () => ({
    OpenAIProvider: class {
        _type = "openai";
        constructor(apiKey: string, model: string) { mockOpenAI(apiKey, model); }
        createChatCompletion = vi.fn();
    },
}));

vi.mock("./anthropic", () => ({
    AnthropicProvider: class {
        _type = "anthropic";
        constructor(apiKey: string, model: string) { mockAnthropic(apiKey, model); }
        createChatCompletion = vi.fn();
    },
}));

vi.mock("./gemini", () => ({
    GeminiProvider: class {
        _type = "gemini";
        constructor(apiKey: string, model: string) { mockGemini(apiKey, model); }
        createChatCompletion = vi.fn();
    },
}));

describe("getProvider", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('returns GroqProvider for "GROQ"', () => {
        const provider = getProvider({ provider: "GROQ", model: "llama-3.3-70b-versatile", apiKey: "test-key" }) as any;
        expect(provider._type).toBe("groq");
    });

    it('returns OpenAIProvider for "OPENAI"', () => {
        const provider = getProvider({ provider: "OPENAI", model: "gpt-4o", apiKey: "test-key" }) as any;
        expect(provider._type).toBe("openai");
    });

    it('returns AnthropicProvider for "CLAUDE"', () => {
        const provider = getProvider({ provider: "CLAUDE", model: "claude-3-5-sonnet", apiKey: "test-key" }) as any;
        expect(provider._type).toBe("anthropic");
    });

    it('returns GeminiProvider for "GEMINI"', () => {
        const provider = getProvider({ provider: "GEMINI", model: "gemini-2.5-flash", apiKey: "test-key" }) as any;
        expect(provider._type).toBe("gemini");
    });

    it("is case-insensitive", () => {
        const provider = getProvider({ provider: "groq", model: "test", apiKey: "key" }) as any;
        expect(provider._type).toBe("groq");
    });

    it("passes apiKey from config", () => {
        getProvider({ provider: "GROQ", model: "test", apiKey: "my-key" });
        expect(mockGroq).toHaveBeenCalledWith("my-key", "test");
    });

    it("falls back to env var when no apiKey in config", () => {
        const originalKey = process.env.GROQ_API_KEY;
        process.env.GROQ_API_KEY = "env-key";
        try {
            getProvider({ provider: "GROQ", model: "test" });
            expect(mockGroq).toHaveBeenCalledWith("env-key", "test");
        } finally {
            if (originalKey !== undefined) {
                process.env.GROQ_API_KEY = originalKey;
            } else {
                delete process.env.GROQ_API_KEY;
            }
        }
    });

    it("throws Error for unknown provider", () => {
        expect(() =>
            getProvider({ provider: "UNKNOWN", model: "test" })
        ).toThrow("Unsupported AI provider: UNKNOWN");
    });
});
