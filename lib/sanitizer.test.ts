import { describe, it, expect } from 'vitest';
import { sanitizeText, stripPlatformReferences } from './sanitizer';

describe('Sanitizer Utilities', () => {
    describe('sanitizeText', () => {
        it('strips LLM meta-commentary', () => {
            const input = "Here is the translation: This is the actual news. (Note: I am an AI)";
            expect(sanitizeText(input)).toBe("This is the actual news.");
        });

        it('strips markdown bolding but keeps text', () => {
            const input = "The **OpenAI** CEO said something __important__.";
            expect(sanitizeText(input)).toBe("The OpenAI CEO said something important.");
        });

        it('replaces markdown bullets with dots', () => {
            const input = "- Fact 1\n* Fact 2";
            expect(sanitizeText(input)).toBe("• Fact 1\n• Fact 2");
        });

        it('cleans headlines correctly', () => {
            const input = '"A Viral Title."';
            expect(sanitizeText(input, { isHeadline: true })).toBe("A Viral Title");
        });

        it('returns null for junk content', () => {
            expect(sanitizeText("...")).toBeNull();
            expect(sanitizeText("  ")).toBeNull();
            expect(sanitizeText("x")).toBeNull();
        });
    });

    describe('stripPlatformReferences', () => {
        it('removes markdown link syntax but keeps title', () => {
            const input = "Check out [The New York Times](https://nytimes.com)";
            expect(stripPlatformReferences(input)).toBe("Check out The New York Times");
        });

        it('strips @mentions and author links', () => {
            const input = "As mentioned by @[John Doe](https://threads.net/@jdoe)";
            expect(stripPlatformReferences(input)).toBe("As mentioned by John Doe");
        });

        it('strips raw URLs', () => {
            const input = "Visit https://google.com for more.";
            expect(stripPlatformReferences(input)).toBe("Visit  for more.");
        });

        it('strips @handles', () => {
            const input = "Contact @openai for support.";
            expect(stripPlatformReferences(input)).toBe("Contact openai for support.");
        });
    });
});
