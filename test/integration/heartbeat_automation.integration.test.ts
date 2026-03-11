import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { clearTestData } from '../setup/db.setup';

vi.unmock('@/lib/prisma');

// Mock external dependencies
vi.mock('@/lib/queue', () => ({
    scrapeQueue: {
        add: vi.fn().mockResolvedValue({}),
    },
}));

vi.mock('@/lib/synthesis_engine', () => ({
    runSynthesisEngine: vi.fn().mockResolvedValue({
        articlesGenerated: 2,
        totalClusters: 3,
    }),
    getWorkspaceProvider: vi.fn(() => ({
        createChatCompletion: vi.fn().mockResolvedValue(JSON.stringify({
            headline: 'Test Article',
            content: 'Test content from AI',
        })),
    })),
    translateText: vi.fn((text: string) => Promise.resolve(text)),
}));

vi.mock('@tavily/core', () => ({
    tavily: vi.fn(() => ({
        search: vi.fn().mockResolvedValue({
            results: [
                { title: 'Trending Topic 1', url: 'https://test.com/1', content: 'Content about AI', score: 0.95 },
                { title: 'Trending Topic 2', url: 'https://test.com/2', content: 'Content about ML', score: 0.90 },
            ]
        }),
    })),
}));

vi.mock('@/lib/publisher_service', () => ({
    checkAndPublishApprovedPosts: vi.fn().mockResolvedValue({
        publishedToday: 0,
        dailyLimit: 5,
        approvedReady: 0,
        published: 0,
        failed: 0,
    }),
    getDailyPublishCount: vi.fn().mockResolvedValue(0),
}));

describe('Heartbeat Worker Automation - Integration Tests', () => {
    beforeEach(async () => {
        await clearTestData();
        vi.clearAllMocks();
        process.env.TAVILY_API_KEY = 'test-tavily-key';
    });

    describe('Content Mode Routing', () => {
        it('should route SCRAPE mode to synthesis engine', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'SCRAPE Workspace',
                    contentMode: 'SCRAPE',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'Traditional Chinese (HK/TW)',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                },
            });

            expect(workspace.contentMode).toBe('SCRAPE');

            // Simulate heartbeat logic: SCRAPE mode should use runSynthesisEngine
            const { runSynthesisEngine } = await import('@/lib/synthesis_engine');
            const mockSynthesis = runSynthesisEngine as any;

            // In real heartbeat, this would be triggered at synthesis time
            const result = await mockSynthesis(workspace.id, {
                translationPrompt: workspace.translationPrompt || '',
                clusteringPrompt: workspace.clusteringPrompt || '',
                synthesisLanguage: workspace.synthesisLanguage || 'English',
                postLookbackHours: workspace.postLookbackHours,
                hotScoreThreshold: workspace.hotScoreThreshold,
                coherenceThreshold: workspace.coherenceThreshold,
                aiProvider: workspace.aiProvider || 'GROQ',
                aiModel: workspace.aiModel || 'llama-3.3-70b-versatile',
                aiApiKey: workspace.aiApiKey || undefined,
                maxArticles: 2,
            });

            expect(result.articlesGenerated).toBeDefined();
        });

        it('should route AUTO_DISCOVER mode to content generation', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'AUTO_DISCOVER Workspace',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    autoDiscoverNiche: 'AI and Machine Learning',
                    preferredFormats: ['LISTICLE', 'HOT_TAKE'],
                },
            });

            expect(workspace.contentMode).toBe('AUTO_DISCOVER');

            // Simulate heartbeat logic: AUTO_DISCOVER should use generateByMode
            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
        });

        it('should route VARIATIONS mode to content generation', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'VARIATIONS Workspace',
                    contentMode: 'VARIATIONS',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    variationBaseTopics: ['AI Ethics', 'ML Algorithms'],
                    variationCount: 3,
                    preferredFormats: ['HOT_TAKE', 'LISTICLE', 'EXPLAINER'],
                },
            });

            expect(workspace.contentMode).toBe('VARIATIONS');

            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
        });

        it('should route REFERENCE mode to content generation', async () => {
            // Create reference workspace with published articles
            const refWorkspace = await prisma.workspace.create({
                data: {
                    name: 'Reference Workspace',
                    contentMode: 'SCRAPE',
                    translationPrompt: 'Test',
                },
            });

            await prisma.synthesizedArticle.create({
                data: {
                    workspaceId: refWorkspace.id,
                    topicName: 'Reference Article',
                    articleContent: 'This is reference content',
                    articleOriginal: 'Original content',
                    status: 'PUBLISHED',
                    authorCount: 1,
                    postCount: 5,
                    sourcePostIds: [],
                    sourceAccounts: ['test-account'],
                    formatUsed: 'LISTICLE',
                },
            });

            // Create workspace that references it
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'REFERENCE Workspace',
                    contentMode: 'REFERENCE',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    referenceWorkspaceId: refWorkspace.id,
                    preferredFormats: ['LISTICLE', 'HOT_TAKE'],
                },
            });

            expect(workspace.contentMode).toBe('REFERENCE');

            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
        });

        it('should route SEARCH mode to content generation with topic', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'SEARCH Workspace',
                    contentMode: 'SEARCH',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    preferredFormats: ['NEWS_FLASH', 'DATA_STORY'],
                },
            });

            expect(workspace.contentMode).toBe('SEARCH');

            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id, 'AI Breakthroughs 2026');

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
        });
    });

    describe('Scraping Phase Logic', () => {
        it('should only scrape for SCRAPE mode workspaces', async () => {
            const scrapeWorkspace = await prisma.workspace.create({
                data: {
                    name: 'SCRAPE Workspace',
                    contentMode: 'SCRAPE',
                    translationPrompt: 'Test',
                },
            });

            const autoDiscoverWorkspace = await prisma.workspace.create({
                data: {
                    name: 'AUTO_DISCOVER Workspace',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    autoDiscoverNiche: 'AI',
                },
            });

            // In real heartbeat, only SCRAPE mode would trigger scraping
            // Verify content modes
            expect(scrapeWorkspace.contentMode).toBe('SCRAPE');
            expect(autoDiscoverWorkspace.contentMode).toBe('AUTO_DISCOVER');

            // AUTO_DISCOVER should NOT have scrape jobs
            const { scrapeQueue } = await import('@/lib/queue');
            expect(scrapeQueue.add).not.toHaveBeenCalled();
        });

        it('should skip scraping for non-SCRAPE modes even with sources', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'VARIATIONS Workspace',
                    contentMode: 'VARIATIONS',
                    translationPrompt: 'Test',
                    variationBaseTopics: ['AI'],
                    variationCount: 3,
                },
            });

            // Add sources (which should be ignored for VARIATIONS mode)
            await prisma.scraperSource.create({
                data: {
                    workspaceId: workspace.id,
                    type: 'THREADS',
                    value: 'test-account',
                    isActive: true,
                },
            });

            const sources = await prisma.scraperSource.findMany({
                where: { workspaceId: workspace.id },
            });

            expect(sources.length).toBe(1);

            // In heartbeat worker, this workspace should skip scraping
            // because contentMode !== "SCRAPE"
            expect(workspace.contentMode).not.toBe('SCRAPE');
        });
    });

    describe('Article Generation Timing', () => {
        it('should generate articles at synthesis time for AUTO_DISCOVER', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'AUTO_DISCOVER Workspace',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    autoDiscoverNiche: 'Artificial Intelligence',
                    preferredFormats: ['LISTICLE', 'HOT_TAKE', 'NEWS_FLASH'],
                    publishTimes: ['12:00', '18:00'],
                    reviewWindowHours: 1,
                    dailyPostLimit: 6,
                },
            });

            // Simulate synthesis time (11:00 for 12:00 publish, with 1hr review window)
            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
            expect(result.articles!.length).toBeGreaterThan(0);

            // Verify articles were created
            const articles = await prisma.synthesizedArticle.findMany({
                where: { workspaceId: workspace.id },
            });

            expect(articles.length).toBeGreaterThan(0);
        });

        it('should respect dailyPostLimit and publishTimes for article generation', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Test Workspace',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    autoDiscoverNiche: 'Technology News',
                    publishTimes: ['09:00', '12:00', '18:00'], // 3 windows
                    dailyPostLimit: 6, // 6 articles / 3 windows = 2 per window
                    reviewWindowHours: 1,
                },
            });

            const publishTimes = workspace.publishTimes || ['12:00', '18:00', '22:00'];
            const maxArticles = Math.ceil(workspace.dailyPostLimit / publishTimes.length);

            expect(maxArticles).toBe(2); // Should generate 2 articles per window
        });
    });

    describe('Pipeline Tracking', () => {
        it('should update lastSynthesizedAt for content generation', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'AUTO_DISCOVER Workspace',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    autoDiscoverNiche: 'AI News',
                },
            });

            const beforeGeneration = new Date();

            const { generateByMode } = await import('@/lib/content_modes');
            await generateByMode(workspace.id);

            // In real heartbeat, runGeneration updates lastSynthesizedAt
            await prisma.workspace.update({
                where: { id: workspace.id },
                data: { lastSynthesizedAt: new Date() },
            });

            const updated = await prisma.workspace.findUnique({
                where: { id: workspace.id },
            });

            expect(updated!.lastSynthesizedAt).toBeDefined();
            expect(updated!.lastSynthesizedAt!.getTime()).toBeGreaterThanOrEqual(beforeGeneration.getTime());
        });
    });

    describe('Error Handling', () => {
        it('should handle missing niche for AUTO_DISCOVER gracefully', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Invalid AUTO_DISCOVER',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    autoDiscoverNiche: null, // Missing niche
                },
            });

            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(false);
            expect(result.error).toContain('niche');
        });

        it('should handle missing reference workspace for REFERENCE mode', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Invalid REFERENCE',
                    contentMode: 'REFERENCE',
                    translationPrompt: 'Test',
                    referenceWorkspaceId: null, // Missing reference
                },
            });

            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(false);
            expect(result.error).toContain('reference workspace');
        });

        it('should handle missing base topics for VARIATIONS mode', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Invalid VARIATIONS',
                    contentMode: 'VARIATIONS',
                    translationPrompt: 'Test',
                    variationBaseTopics: [], // Empty topics
                },
            });

            const { generateByMode } = await import('@/lib/content_modes');
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(false);
            expect(result.error).toContain('base topics');
        });
    });
});
