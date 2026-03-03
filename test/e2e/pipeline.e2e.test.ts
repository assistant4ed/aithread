import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { setupTestDB, clearTestData } from '../setup/db.setup';
import { processScrapeJob } from '@/worker/scrape-worker';
import { runSynthesisEngine } from '@/lib/synthesis_engine';
import { Queue } from 'bullmq';
import { SCRAPE_QUEUE_NAME, redisConnection as connection, ScrapeJobData } from '@/lib/queue';

// Mock AI for synthesis
vi.mock('@/lib/ai/provider', () => ({
    getProvider: vi.fn().mockImplementation(() => ({
        createChatCompletion: vi.fn().mockImplementation(async (messages: any) => {
            const systemPrompt = messages[0].content;
            const userContent = messages[1]?.content || '';

            if (systemPrompt.includes('Cluster')) {
                return JSON.stringify([{
                    topic: "Test Story",
                    postIds: ["queued_post_1"],
                    reason: "Similarity"
                }]);
            }
            if (systemPrompt.includes('Translate')) {
                return userContent === 'Test Title' ? 'Test Story' : userContent;
            }
            return JSON.stringify({
                headline: "Test Title",
                summary: "Test Summary",
                content: "Test Article Content"
            });
        })
    })),
    FallbackProvider: vi.fn().mockImplementation(function () {
        return {
            createChatCompletion: vi.fn().mockImplementation(async (messages: any) => {
                const systemPrompt = messages[0].content;
                const userContent = messages[1]?.content || '';
                if (systemPrompt.includes('Translate')) {
                    return userContent === 'Test Title' ? 'Test Story' : userContent;
                }
                return JSON.stringify({
                    headline: "Test Title",
                    summary: "Test Summary",
                    content: "Test Article Content"
                });
            })
        }
    })
}));

// Mock External AI Clients directly (for image generation fallback)
vi.mock('@google/generative-ai', () => ({
    GoogleGenerativeAI: vi.fn().mockImplementation(function () {
        return {
            getGenerativeModel: vi.fn().mockImplementation(() => ({
                generateContent: vi.fn().mockResolvedValue({
                    response: {
                        candidates: [{
                            content: { parts: [{ inlineData: { data: 'fake_base64_data' } }] }
                        }]
                    }
                })
            }))
        };
    })
}));

vi.mock('openai', () => {
    return {
        default: vi.fn().mockImplementation(function () {
            return {
                images: {
                    generate: vi.fn().mockResolvedValue({
                        data: [{ url: 'https://fake-openai-url.com/img.png' }]
                    })
                }
            };
        })
    }
});

// Mock Storage and Image Downloads
vi.mock('@/lib/storage', () => ({
    uploadBufferToStorage: vi.fn().mockResolvedValue('https://fake-storage.com/test.png')
}));

vi.mock('axios', () => ({
    default: {
        get: vi.fn().mockResolvedValue({ data: Buffer.from('fake_image_data') })
    }
}));

// Mock Scraper to return specific posts for the pipeline
vi.mock('@/lib/scraper', () => ({
    ThreadsScraper: vi.fn().mockImplementation(function () {
        return {
            init: vi.fn(),
            close: vi.fn(),
            scrapeAccount: vi.fn().mockResolvedValue([
                {
                    threadId: 'queued_post_1',
                    authorUsername: 'testuser',
                    content: 'Story content about something important',
                    postedAt: new Date().toISOString(),
                    mediaUrls: [],
                    likes: 100,
                    replies: 20,
                    views: 1000
                }
            ]),
            getFollowerCount: vi.fn().mockResolvedValue(1000),
        };
    })
}));

describe('Full Pipeline E2E', () => {
    let queue: Queue<ScrapeJobData>;

    beforeAll(async () => {
        queue = new Queue(SCRAPE_QUEUE_NAME, { connection });
        await clearTestData();
    });

    afterAll(async () => {
        await queue.close();
    });

    it('successfully runs the full flow: Scrape -> Process -> Synthesize', async () => {
        // 1. Setup Workspace & Source
        const ws = await prisma.workspace.create({
            data: {
                name: 'E2E Pipeline WS',
                translationPrompt: 'Translate',
                aiProvider: 'GROQ',
                aiModel: 'model-v1',
                hotScoreThreshold: 10,
                dailyPostLimit: 5,
                sources: {
                    create: {
                        type: 'ACCOUNT',
                        value: 'testuser',
                        platform: 'THREADS',
                        isActive: true
                    }
                }
            },
            include: { sources: true }
        });

        const source = ws.sources[0];

        // 2. Enqueue & Run Scraper Job
        const jobData: ScrapeJobData = {
            target: source.value,
            type: source.type,
            workspaceId: ws.id,
            sourceId: source.id,
            skipTranslation: false,
            settings: {
                translationPrompt: 'Translate',
                aiProvider: 'GROQ',
                aiModel: 'model-v1',
                hotScoreThreshold: 10,
            }
        };

        const job = await queue.add('e2e-job', jobData);
        await processScrapeJob(job as any);

        // Verify post was saved
        const post = await prisma.post.findFirst({ where: { workspaceId: ws.id } });
        expect(post).toBeDefined();
        expect(post?.threadId).toBe('queued_post_1');

        // 3. Trigger Synthesis
        const synthResult = await runSynthesisEngine(ws.id, {
            translationPrompt: 'Translate',
            clusteringPrompt: 'Cluster',
            synthesisLanguage: 'English',
            postLookbackHours: 24,
            hotScoreThreshold: 10,
            coherenceThreshold: 1,
            aiProvider: 'GROQ',
            aiModel: 'model-v1',
            maxArticles: 1,
        });

        expect(synthResult.articlesGenerated).toBe(1);

        // 4. Verify Final Article exists in DB
        const article = await prisma.synthesizedArticle.findFirst({
            where: { workspaceId: ws.id }
        });

        expect(article).toBeDefined();
        expect(article?.topicName).toBe('Test Story');
        expect(article?.status).toBe('PENDING_REVIEW');
    }, 60000);
});
