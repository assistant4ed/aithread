import { describe, it, expect } from "vitest";
import { sanitizeText, stripPlatformReferences } from "./sanitizer";

// ─── sanitizeText ─────────────────────────────────────────────────────────────

describe("sanitizeText", () => {
    // --- LLM meta-commentary removal ---

    it("removes Chinese parenthetical notes （注：...）", () => {
        expect(sanitizeText("AI大突破（注：此為翻譯內容）更多細節")).toBe(
            "AI大突破更多細節"
        );
    });

    it("removes English parenthetical notes (Note: ...)", () => {
        expect(sanitizeText("Big news (Note: translated from Chinese) here")).toBe(
            "Big news  here"
        );
    });

    it("removes trailing Note: lines", () => {
        expect(sanitizeText("Main content.\nNote: This was auto-generated.")).toBe(
            "Main content."
        );
    });

    it("removes Translation note: lines", () => {
        expect(sanitizeText("Article body.\nTranslation note: some context")).toBe(
            "Article body."
        );
    });

    it("removes Translated by: lines", () => {
        expect(sanitizeText("Content here.\nTranslated by: GPT-4")).toBe(
            "Content here."
        );
    });

    it('removes "Here is the translated..." preamble', () => {
        expect(sanitizeText("Here is the translated article:\nActual content")).toBe(
            "Actual content"
        );
    });

    it('removes "Here is the translation" preamble', () => {
        expect(sanitizeText("Here is the translation:\nActual content")).toBe(
            "Actual content"
        );
    });

    it('removes "Title:" prefix', () => {
        expect(sanitizeText("Title: AI Revolution in 2025")).toBe(
            "AI Revolution in 2025"
        );
    });

    it('removes "Headline:" prefix', () => {
        expect(sanitizeText("Headline: Breaking News")).toBe("Breaking News");
    });

    it('removes "**Headline:**" markdown prefix', () => {
        expect(sanitizeText("**Headline:** Big Update")).toBe("Big Update");
    });

    it("removes multiple LLM patterns in same text", () => {
        const input = "Title: Big News\n（注：翻譯）\nNote: AI generated";
        const result = sanitizeText(input);
        expect(result).not.toContain("Title:");
        expect(result).not.toContain("（注：");
        expect(result).not.toContain("Note:");
    });

    // --- Markdown stripping ---

    it("strips **bold** markers but keeps text", () => {
        expect(sanitizeText("This is **important** news")).toBe(
            "This is important news"
        );
    });

    it("strips __underline__ markers but keeps text", () => {
        expect(sanitizeText("This is __underlined__ text")).toBe(
            "This is underlined text"
        );
    });

    it("replaces list bullets with •", () => {
        expect(sanitizeText("Items:\n- First\n- Second\n* Third")).toBe(
            "Items:\n• First\n• Second\n• Third"
        );
    });

    // --- Headline mode ---

    it("strips surrounding quotes in headline mode", () => {
        expect(sanitizeText('"AI Revolution"', { isHeadline: true })).toBe(
            "AI Revolution"
        );
    });

    it("strips surrounding single quotes in headline mode", () => {
        expect(sanitizeText("'Breaking News'", { isHeadline: true })).toBe(
            "Breaking News"
        );
    });

    it("strips trailing period in headline mode", () => {
        expect(sanitizeText("AI Revolution.", { isHeadline: true })).toBe(
            "AI Revolution"
        );
    });

    it("does NOT strip trailing period in normal mode", () => {
        expect(sanitizeText("AI Revolution.")).toBe("AI Revolution.");
    });

    // --- Whitespace ---

    it("collapses 3+ newlines to double newline", () => {
        expect(sanitizeText("Line one\n\n\n\nLine two")).toBe(
            "Line one\n\nLine two"
        );
    });

    // --- Null returns ---

    it("returns null for null input", () => {
        expect(sanitizeText(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
        expect(sanitizeText(undefined)).toBeNull();
    });

    it("returns null for empty string", () => {
        expect(sanitizeText("")).toBeNull();
    });

    it("returns null for punctuation-only input", () => {
        expect(sanitizeText("...")).toBeNull();
    });

    it("returns null for single-char input", () => {
        expect(sanitizeText("X")).toBeNull();
    });

    // --- Edge cases ---

    it("returns null when text is ONLY an LLM note", () => {
        expect(sanitizeText("（注：此為翻譯內容）")).toBeNull();
    });

    it("preserves Chinese text", () => {
        expect(sanitizeText("AI人工智慧大突破")).toBe("AI人工智慧大突破");
    });

    it("preserves mixed English + Chinese", () => {
        expect(sanitizeText("OpenAI 發布了 GPT-5")).toBe("OpenAI 發布了 GPT-5");
    });

    it("preserves emoji in text", () => {
        expect(sanitizeText("🔥 Big update coming")).toBe("🔥 Big update coming");
    });

    it("keeps legitimate parenthetical that does NOT match patterns", () => {
        expect(sanitizeText("Revenue grew (up 40%) this quarter")).toBe(
            "Revenue grew (up 40%) this quarter"
        );
    });
});

// ─── stripPlatformReferences ──────────────────────────────────────────────────

describe("stripPlatformReferences", () => {
    it("strips @[Author](url) → Author", () => {
        expect(
            stripPlatformReferences("Post by @[John Doe](https://threads.net/@john)")
        ).toBe("Post by John Doe");
    });

    it("strips @[Author] → Author", () => {
        expect(stripPlatformReferences("Post by @[Jane Smith]")).toBe(
            "Post by Jane Smith"
        );
    });

    it("strips @handle → handle", () => {
        expect(stripPlatformReferences("Post by @openai")).toBe("Post by openai");
    });

    it("strips @user.name_123 with dots and underscores", () => {
        expect(stripPlatformReferences("@user.name_123 posted")).toBe(
            "user.name_123 posted"
        );
    });

    it("strips [Link](url) → Link", () => {
        expect(
            stripPlatformReferences("Check [this article](https://example.com)")
        ).toBe("Check this article");
    });

    it("strips standalone [Title] → Title", () => {
        expect(stripPlatformReferences("See [More Details]")).toBe(
            "See More Details"
        );
    });

    it("removes raw https:// URLs entirely", () => {
        expect(
            stripPlatformReferences("Visit https://openai.com/blog for more")
        ).toBe("Visit  for more");
    });

    it("handles multiple mixed patterns in one text", () => {
        const input =
            "@[Sam](https://x.com/sam) said check https://openai.com and [read more](https://blog.com)";
        const result = stripPlatformReferences(input);
        expect(result).not.toContain("@");
        expect(result).not.toContain("https://");
        expect(result).not.toContain("[");
        expect(result).toContain("Sam");
        expect(result).toContain("read more");
    });

    it("returns empty string for null", () => {
        expect(stripPlatformReferences(null)).toBe("");
    });

    it("returns empty string for undefined", () => {
        expect(stripPlatformReferences(undefined)).toBe("");
    });

    it("handles realistic leakage: According to @[openai](url), the new...", () => {
        const input =
            "According to @[openai](https://openai.com), the new model is faster.";
        const result = stripPlatformReferences(input);
        expect(result).toBe(
            "According to openai, the new model is faster."
        );
    });
});
