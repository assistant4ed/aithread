/**
 * Sanitizer module to strip known LLM artifacts from synthesized text.
 * Removes parenthetical notes, translation disclaimers, and other common leakage.
 */

interface SanitizeOptions {
    isHeadline?: boolean;
}

export function sanitizeText(text: string | null | undefined, options: SanitizeOptions = {}): string | null {
    if (!text) return null;

    let clean = text.trim();

    // 1. Remove common LLM meta-commentary patterns
    const patterns = [
        /（注：.*?）/g,                // (Note: ...) in Chinese
        /\(Note:.*?\)/gi,              // (Note: ...) in English
        /（or.*?）/gi,                 // (or ...) 
        /\(or.*?\)/gi,                 // (or ...)
        /Note:.*?$/gim,                // Trailing "Note: ..." line
        /Translation note:.*?$/gim,    // Trailing "Translation note: ..."
        /Translated by:.*?$/gim,       // Trailing "Translated by: ..."
        /Here is the translated.*?$/gim, // "Here is the translated..." preamble
        /^Here is the translation:?/gim, // Preamble (colon optional for this verbose one)
        /^Title:\s*/gim,                 // "Title:" prefix (require colon)
        /^Headline:\s*/gim,              // "Headline:" prefix (require colon)
        /^\*\*Headline:\*\*/gim,       // "**Headline:**" prefix
    ];

    for (const pattern of patterns) {
        clean = clean.replace(pattern, "");
    }

    // 2. Remove markdown artifacts that shouldn't be in social text
    // We want to keep some markdown like bolding for emphasis, but strip others?
    // Actually, for Threads/clean text, we might want to strip most markdown.
    // Let's strip bolding markers but keep the text.
    clean = clean.replace(/\*\*(.*?)\*\*/g, "$1"); // **text** -> text
    clean = clean.replace(/__(.*?)__/g, "$1");     // __text__ -> text
    clean = clean.replace(/^\s*[-*]\s+/gm, "• ");  // Replace list bullets with •

    // 3. Headline specific cleaning
    if (options.isHeadline) {
        clean = clean.replace(/^["'](.*)["']$/, "$1"); // Strip surrounding quotes
        clean = clean.replace(/\.$/, ""); // Strip trailing period from headlines
    }

    // 4. Final whitespace cleanup
    clean = clean.replace(/\n{3,}/g, "\n\n").trim();

    // 5. Validation: If result is empty or just punctuation/garbage, return null
    if (clean.length === 0) return null;
    if (/^[\.\,\?\!\-\s]+$/.test(clean)) return null; // Just punctuation
    if (clean.length < 2) return null; // Too short (single char usually garbage)

    return clean;
}

/**
 * Strips platform-specific references like @mentions and outbound links 
 * just before publishing to keep platform algorithms happy.
 * 
 * - @[Author Name](url) -> Author Name
 * - @[Author Name] -> Author Name
 * - [Link Title](url) -> Link Title
 * - [Link Title] -> Link Title
 * - raw URLs -> removed
 */
export function stripPlatformReferences(text: string | null | undefined): string {
    if (!text) return "";

    let clean = text;

    // 1. Strip @mentions with links: @[Author Name](url) -> Author Name
    clean = clean.replace(/@?\[([^\]]+)\]\([^\)]+\)/g, "$1");

    // 2. Strip standard Markdown Links: [Title](URL) -> Title
    clean = clean.replace(/\[([^\]]+)\]\([^\)]+\)/g, "$1");

    // 3. Strip @mentions formatting but keep name: @[Author] -> Author
    clean = clean.replace(/@\[([^\]]+)\]/g, "$1");

    // 3. Strip raw URLs (http/https)
    // We use a simplified regex for URLs to avoid aggressive stripping of other punctuation
    clean = clean.replace(/https?:\/\/[^\s\n\)]+/gi, "");

    // 4. Clean up any leftover empty brackets from misformatted markdown [Title] -> Title
    clean = clean.replace(/\[([^\]]+)\]/g, "$1");

    // 5. Final cleanup of whitespace and empty lines that might result from stripping
    clean = clean.replace(/\n{3,}/g, "\n\n").trim();

    return clean;
}
