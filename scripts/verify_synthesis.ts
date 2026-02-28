/**
 * AI & Synthesis Pipeline Verification — Live DB + API
 *
 * Runs 4 checks:
 *   1. LLM Connectivity (Groq, OpenAI, Gemini) — direct SDK calls
 *   2. Clustering Quality — recent article stats
 *   3. Content Sanitization Scan — leakage detection
 *   4. Translation Quality — Chinese character ratio
 *
 * Usage:
 *   npx tsx scripts/verify_synthesis.ts
 */

import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import Groq from "groq-sdk";
import OpenAI from "openai";
import { GoogleGenerativeAI } from "@google/generative-ai";

const prisma = new PrismaClient();

// ─── Formatting ──────────────────────────────────────────────────────────────

function header(title: string) {
    const line = "═".repeat(60);
    console.log(`\n${line}`);
    console.log(`  ${title}`);
    console.log(`${line}\n`);
}

function pass(msg: string) { console.log(`  [PASS] ${msg}`); }
function fail(msg: string) { console.log(`  [FAIL] ${msg}`); }
function info(msg: string) { console.log(`  [INFO] ${msg}`); }
function warn(msg: string) { console.log(`  [WARN] ${msg}`); }

let passed = 0;
let failed = 0;

function check(condition: boolean, passMsg: string, failMsg: string) {
    if (condition) {
        pass(passMsg);
        passed++;
    } else {
        fail(failMsg);
        failed++;
    }
}

// ─── CHECK 1: LLM Connectivity ──────────────────────────────────────────────

async function checkLLMConnectivity() {
    header("CHECK 1 — LLM CONNECTIVITY");

    // Groq
    const groqKey = process.env.GROQ_API_KEY;
    if (groqKey) {
        const start = Date.now();
        try {
            const client = new Groq({ apiKey: groqKey });
            const res = await client.chat.completions.create({
                messages: [{ role: "user", content: "Respond with exactly: PONG" }],
                model: "llama-3.3-70b-versatile",
                max_tokens: 10,
                temperature: 0,
            });
            const latency = Date.now() - start;
            const text = res.choices[0]?.message?.content || "";
            check(
                text.toUpperCase().includes("PONG"),
                `GROQ responded "${text.trim()}" in ${latency}ms`,
                `GROQ unexpected response: "${text.trim()}" (${latency}ms)`
            );
        } catch (e: any) {
            const latency = Date.now() - start;
            const status = e.status || e.statusCode || "unknown";
            fail(`GROQ error (HTTP ${status}, ${latency}ms): ${e.message}`);
            failed++;
        }
    } else {
        info("GROQ: skipped (no GROQ_API_KEY)");
    }

    // OpenAI
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
        const start = Date.now();
        try {
            const client = new OpenAI({ apiKey: openaiKey });
            const res = await client.chat.completions.create({
                messages: [{ role: "user", content: "Respond with exactly: PONG" }],
                model: "gpt-4o-mini",
                max_tokens: 10,
                temperature: 0,
            });
            const latency = Date.now() - start;
            const text = res.choices[0]?.message?.content || "";
            check(
                text.toUpperCase().includes("PONG"),
                `OPENAI responded "${text.trim()}" in ${latency}ms`,
                `OPENAI unexpected response: "${text.trim()}" (${latency}ms)`
            );
        } catch (e: any) {
            const latency = Date.now() - start;
            const status = e.status || e.statusCode || "unknown";
            fail(`OPENAI error (HTTP ${status}, ${latency}ms): ${e.message}`);
            failed++;
        }
    } else {
        info("OPENAI: skipped (no OPENAI_API_KEY)");
    }

    // Gemini
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
        const start = Date.now();
        try {
            const genAI = new GoogleGenerativeAI(geminiKey);
            const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
            const result = await model.generateContent("Respond with exactly: PONG");
            const latency = Date.now() - start;
            const text = result.response.text() || "";
            check(
                text.toUpperCase().includes("PONG"),
                `GEMINI responded "${text.trim()}" in ${latency}ms`,
                `GEMINI unexpected response: "${text.trim()}" (${latency}ms)`
            );
        } catch (e: any) {
            const latency = Date.now() - start;
            const status = e.status || e.statusCode || "unknown";
            fail(`GEMINI error (HTTP ${status}, ${latency}ms): ${e.message}`);
            failed++;
        }
    } else {
        info("GEMINI: skipped (no GEMINI_API_KEY)");
    }
}

// ─── CHECK 2: Clustering Quality ────────────────────────────────────────────

async function checkClusteringQuality() {
    header("CHECK 2 — CLUSTERING QUALITY");

    const since = new Date(Date.now() - 48 * 3600_000);

    const articles = await prisma.synthesizedArticle.findMany({
        where: { createdAt: { gte: since } },
        select: {
            id: true,
            topicName: true,
            postCount: true,
            authorCount: true,
        },
    });

    info(`Found ${articles.length} articles in the last 48h`);

    if (articles.length === 0) {
        warn("No recent articles — skipping clustering quality checks.");
        return;
    }

    // Verify basic constraints
    const validPostCount = articles.every((a) => a.postCount >= 2);
    check(
        validPostCount,
        "All articles have postCount >= 2",
        `Some articles have postCount < 2: ${articles.filter((a) => a.postCount < 2).map((a) => `${a.id}(${a.postCount})`).join(", ")}`
    );

    const validAuthorCount = articles.every((a) => a.authorCount >= 1);
    check(
        validAuthorCount,
        "All articles have authorCount >= 1",
        `Some articles have authorCount < 1: ${articles.filter((a) => a.authorCount < 1).map((a) => a.id).join(", ")}`
    );

    // Distribution
    const dist = { "2": 0, "3": 0, "4": 0, "5+": 0 };
    for (const a of articles) {
        if (a.postCount >= 5) dist["5+"]++;
        else if (a.postCount === 4) dist["4"]++;
        else if (a.postCount === 3) dist["3"]++;
        else dist["2"]++;
    }
    info(`Post count distribution: 2-post=${dist["2"]}, 3-post=${dist["3"]}, 4-post=${dist["4"]}, 5+-post=${dist["5+"]}`);
}

// ─── CHECK 3: Content Sanitization Scan ──────────────────────────────────────

async function checkContentSanitization() {
    header("CHECK 3 — CONTENT SANITIZATION SCAN");

    const since = new Date(Date.now() - 48 * 3600_000);

    const articles = await prisma.synthesizedArticle.findMany({
        where: { createdAt: { gte: since } },
        select: {
            id: true,
            topicName: true,
            articleContent: true,
        },
    });

    if (articles.length === 0) {
        warn("No recent articles to scan.");
        return;
    }

    let mentionLeaks = 0;
    let urlLeaks = 0;
    let mdLinkLeaks = 0;
    let metaLeaks = 0;

    for (const a of articles) {
        const text = `${a.topicName || ""}\n${a.articleContent || ""}`;

        // @mentions
        const mentions = text.match(/@[a-zA-Z0-9_.]{2,}/g);
        if (mentions) {
            mentionLeaks++;
            info(`Article ${a.id}: @mention leakage → ${mentions.slice(0, 3).join(", ")}`);
        }

        // Raw URLs
        const urls = text.match(/https?:\/\//g);
        if (urls) {
            urlLeaks++;
            const urlMatches = text.match(/https?:\/\/[^\s\n)]+/g) || [];
            info(`Article ${a.id}: raw URL leakage → ${urlMatches.slice(0, 2).join(", ")}`);
        }

        // Markdown links
        const mdLinks = text.match(/\[.*?\]\(.*?\)/g);
        if (mdLinks) {
            mdLinkLeaks++;
            info(`Article ${a.id}: markdown link leakage → ${mdLinks.slice(0, 2).join(", ")}`);
        }

        // LLM meta-commentary
        const metaPatterns = /(?:^|\n)\s*(?:Note:|Translation note:|Translated by:)/im;
        if (metaPatterns.test(text)) {
            metaLeaks++;
            info(`Article ${a.id}: LLM meta-commentary detected`);
        }
    }

    check(mentionLeaks === 0, `No @mention leakage (${articles.length} articles)`, `${mentionLeaks}/${articles.length} articles have @mention leaks`);
    check(urlLeaks === 0, `No raw URL leakage (${articles.length} articles)`, `${urlLeaks}/${articles.length} articles have raw URL leaks`);
    check(mdLinkLeaks === 0, `No markdown link leakage (${articles.length} articles)`, `${mdLinkLeaks}/${articles.length} articles have markdown link leaks`);
    check(metaLeaks === 0, `No LLM meta-commentary leakage (${articles.length} articles)`, `${metaLeaks}/${articles.length} articles have LLM meta-commentary leaks`);
}

// ─── CHECK 4: Translation Quality ───────────────────────────────────────────

async function checkTranslationQuality() {
    header("CHECK 4 — TRANSLATION QUALITY");

    const since = new Date(Date.now() - 48 * 3600_000);

    const articles = await prisma.synthesizedArticle.findMany({
        where: { createdAt: { gte: since } },
        select: {
            id: true,
            topicName: true,
            articleContent: true,
            articleOriginal: true,
        },
    });

    if (articles.length === 0) {
        warn("No recent articles to check translation quality.");
        return;
    }

    const chineseCharRegex = /[\u4e00-\u9fff]/g;
    let hasChinese = 0;
    let hasOriginal = 0;
    let lowRatioCount = 0;

    for (const a of articles) {
        const content = a.articleContent || "";
        const chineseChars = content.match(chineseCharRegex) || [];
        const ratio = content.length > 0 ? chineseChars.length / content.length : 0;

        if (chineseChars.length > 0) hasChinese++;
        if (a.articleOriginal) hasOriginal++;
        if (ratio < 0.3 && content.length > 10) {
            lowRatioCount++;
            info(`Article ${a.id}: low Chinese ratio ${(ratio * 100).toFixed(1)}%`);
        }
    }

    check(
        hasChinese === articles.length,
        `All ${articles.length} articles contain Chinese characters`,
        `${articles.length - hasChinese}/${articles.length} articles have no Chinese characters`
    );

    check(
        hasOriginal === articles.length,
        `All ${articles.length} articles have articleOriginal (English pre-translation)`,
        `${articles.length - hasOriginal}/${articles.length} articles missing articleOriginal`
    );

    check(
        lowRatioCount === 0,
        `All articles have > 30% Chinese character ratio`,
        `${lowRatioCount}/${articles.length} articles have low Chinese ratio (< 30%)`
    );

    // Report workspace translation prompt for manual review
    const workspace = await prisma.workspace.findFirst({
        select: { translationPrompt: true, synthesisLanguage: true },
    });
    if (workspace) {
        info(`Workspace synthesisLanguage: "${workspace.synthesisLanguage}"`);
        info(`Workspace translationPrompt: "${workspace.translationPrompt?.slice(0, 200)}${(workspace.translationPrompt?.length || 0) > 200 ? "..." : ""}"`);
    }
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
    header("AI & SYNTHESIS PIPELINE VERIFICATION");

    await checkLLMConnectivity();
    await checkClusteringQuality();
    await checkContentSanitization();
    await checkTranslationQuality();

    // Summary
    header("SUMMARY");
    console.log(`  Passed: ${passed}`);
    console.log(`  Failed: ${failed}`);
    console.log(`  Total:  ${passed + failed}\n`);

    if (failed > 0) {
        console.log("  ⚠ Some checks failed — review above.\n");
    } else {
        console.log("  ✓ All checks passed.\n");
    }

    await prisma.$disconnect();
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(async (e) => {
    console.error("Fatal error:", e);
    await prisma.$disconnect();
    process.exit(2);
});
