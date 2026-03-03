import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { Queue, Worker } from 'bullmq';
import { SCRAPE_QUEUE_NAME, redisConnection, ScrapeJobData } from '@/lib/queue';
import { prisma } from '@/lib/prisma';
import { clearTestData } from '../setup/db.setup';

// Mock Scraper to avoid launching a real browser in this specific test
vi.mock('@/lib/scraper', () => ({
    ThreadsScraper: vi.fn().mockImplementation(function () {
        return {
            init: vi.fn(),
            close: vi.fn(),
            scrapeAccount: vi.fn().mockResolvedValue([
                {
                    threadId: 'queued_post_1',
                    authorUsername: 'testuser',
                    content: 'Queued post content',
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

// Mock Storage and AI
vi.mock('@/lib/storage', () => ({
    uploadMediaToStorage: vi.fn().mockResolvedValue('http://mockstorage.com/file'),
}));

vi.mock('@/lib/ai/provider', () => ({
    getProvider: vi.fn().mockReturnValue({
        createChatCompletion: vi.fn().mockResolvedValue(JSON.stringify({ translated: "Translated content" }))
    }),
    FallbackProvider: vi.fn(),
}));

describe('Worker Queue Integration', () => {
    let testQueue: Queue<ScrapeJobData>;

    beforeAll(async () => {
        testQueue = new Queue(SCRAPE_QUEUE_NAME, { connection: redisConnection });
        await clearTestData();
    });

    afterAll(async () => {
        await testQueue.close();
    });

    it('successfully processes a job from the queue', async () => {
        // 1. Setup a workspace
        const ws = await prisma.workspace.create({
            data: {
                name: 'Queue Test WS',
                translationPrompt: 'Translate this',
                aiProvider: 'GROQ',
                aiModel: 'model-v1',
                hotScoreThreshold: 10,
            }
        });

        const jobData: ScrapeJobData = {
            target: 'testuser',
            type: 'ACCOUNT',
            workspaceId: ws.id,
            skipTranslation: false,
            settings: {
                translationPrompt: 'Translate this',
                aiProvider: 'GROQ',
                aiModel: 'model-v1',
                hotScoreThreshold: 10,
            }
        };

        // 2. Add job to queue
        const job = await testQueue.add('test-job', jobData);
        expect(job.id).toBeDefined();

        // 3. Manually run the worker logic (using a temporary worker in the test)
        // We import the processor function from the worker file
        const { processScrapeJob } = await import('@/worker/scrape-worker');

        // We wrap the processScrapeJob call as a BullMQ worker would
        await processScrapeJob(job as any);

        // 4. Verify results in Database
        const post = await prisma.post.findUnique({
            where: {
                threadId_workspaceId: {
                    threadId: 'queued_post_1',
                    workspaceId: ws.id
                }
            }
        });

        expect(post).toBeDefined();
        expect(post?.contentOriginal).toBe('Queued post content');
        expect(post?.workspaceId).toBe(ws.id);
    }, 20000);
});
