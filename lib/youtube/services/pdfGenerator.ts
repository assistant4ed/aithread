import puppeteer from 'puppeteer';
import handlebars from 'handlebars';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { GeneratedScript } from '../types/youtube.js';
import type { MediaAssets } from './mediaAssets.js';

export async function generatePDF(
    script: GeneratedScript,
    assets: MediaAssets,
    outputPath: string
): Promise<string> {
    const templatePath = path.join(process.cwd(), 'lib/youtube/templates/document.html');
    const templateHtml = await fs.readFile(templatePath, 'utf-8');
    const template = handlebars.compile(templateHtml);

    // 1. Prepare data for template (convert file paths to Data URIs for Puppeteer)
    const thumbnailDataUri = await toDataUri(assets.thumbnailPath);

    const enrichedChapters = await Promise.all(script.chapters.map(async (c) => {
        const screenshotPath = assets.chapterScreenshots[c.timestampStart];
        return {
            ...c,
            screenshotDataUri: screenshotPath ? await toDataUri(screenshotPath) : null
        };
    }));

    const templateData = {
        ...script,
        cleanTitle: script.cleanTitle || script.title,
        thumbnailDataUri,
        chapters: enrichedChapters,
        generatedAtFormatted: new Date(script.generatedAt).toLocaleDateString('en-US', {
            year: 'numeric', month: 'long', day: 'numeric'
        })
    };

    const html = template(templateData);

    // 2. Launch Puppeteer
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined
    });

    try {
        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        // 2.5 Wait for web fonts to load (CRITICAL for Chinese characters on Linux)
        await page.evaluateHandle('document.fonts.ready');

        // 3. Generate PDF
        await page.pdf({
            path: outputPath,
            format: 'A4',
            margin: { top: '20px', bottom: '20px', left: '20px', right: '20px' },
            printBackground: true,
            displayHeaderFooter: false
        });

        console.log(`[PDF] Generated successfully at ${outputPath}`);
        return outputPath;

    } finally {
        await browser.close();
    }
}

async function toDataUri(filePath: string): Promise<string | null> {
    try {
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        const mime = ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' : `image/${ext}`;
        const data = await fs.readFile(filePath);
        return `data:${mime};base64,${data.toString('base64')}`;
    } catch {
        return null;
    }
}
