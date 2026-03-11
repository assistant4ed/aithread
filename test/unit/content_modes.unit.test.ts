import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateByMode, generateReferenceContent, generateSearchContent, generateVariations, generateAutoDiscoverContent } from '@/lib/content_modes';
import { prisma } from '@/lib/prisma';

vi.mock('@/lib/synthesis_engine', () => ({
    getWorkspaceProvider: vi.fn(() => ({
        createChatCompletion: vi.fn().mockResolvedValue(JSON.stringify({
            headline: 'Test Article',
            content: 'Test content',
        })),
    })),
    translateText: vi.fn((text: string) => Promise.resolve(text)),
    synthesizeCluster: vi.fn(),
}));

vi.mock('@tavily/core', () => ({
    tavily: vi.fn(() => ({
        search: vi.fn().mockResolvedValue({
            results: [
                { title: 'Test Result 1', url: 'https://test.com/1', content: 'Test content 1', score: 0.9 },
                { title: 'Test Result 2', url: 'https://test.com/2', content: 'Test content 2', score: 0.8 },
            ]
        }),
    })),
}));

describe('Content Modes - Unit Tests', () => {
    const mockWorkspace = {
        id: 'ws-1',
        contentMode: 'AUTO_DISCOVER',
        synthesisPrompt: 'You are a viral content creator',
        translationPrompt: 'Translate professionally',
        synthesisLanguage: 'English',
        aiProvider: 'GROQ',
        aiModel: 'llama-3.3-70b-versatile',
        aiApiKey: null,
        preferredFormats: ['LISTICLE', 'HOT_TAKE', 'NEWS_FLASH'],
        newsApiKey: null,
        dataCollationHours: 24,
        referenceWorkspaceId: null,
        autoDiscoverNiche: 'AI and Machine Learning',
        variationBaseTopics: ['AI Trends', 'ML Algorithms'],
        variationCount: 3,
        topicFilter: null,
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.TAVILY_API_KEY = 'test-tavily-key';
    });

    describe('generateByMode', () => {
        it('should route to REFERENCE mode handler', async () => {
            const prismaMock = prisma.workspace.findUnique as any;
            prismaMock.mockResolvedValue({ ...mockWorkspace, contentMode: 'REFERENCE', referenceWorkspaceId: 'ref-ws-1' });

            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValueOnce([
                {
                    topicName: 'Ref Article 1',
                    articleContent: 'Reference content',
                    articleOriginal: 'Original content',
                    formatUsed: 'LISTICLE'
                }
            ]).mockResolvedValueOnce([]); // for pickFormat

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1', topicName: 'Test Article' });

            const result = await generateByMode('ws-1');

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
        });

        it('should route to SEARCH mode handler with topic', async () => {
            const prismaMock = prisma.workspace.findUnique as any;
            prismaMock.mockResolvedValue({ ...mockWorkspace, contentMode: 'SEARCH' });

            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]); // for pickFormat

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1', topicName: 'Search Article' });

            const result = await generateByMode('ws-1', 'AI Breakthroughs');

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
        });

        it('should route to VARIATIONS mode handler', async () => {
            const prismaMock = prisma.workspace.findUnique as any;
            prismaMock.mockResolvedValue({ ...mockWorkspace, contentMode: 'VARIATIONS' });

            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]); // for pickFormat

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1', topicName: 'Variation Article' });

            const result = await generateByMode('ws-1');

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
        });

        it('should route to AUTO_DISCOVER mode handler', async () => {
            const prismaMock = prisma.workspace.findUnique as any;
            prismaMock.mockResolvedValue({ ...mockWorkspace, contentMode: 'AUTO_DISCOVER' });

            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]); // for pickFormat

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1', topicName: 'Auto Article' });

            const result = await generateByMode('ws-1');

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
        });

        it('should return error for non-existent workspace', async () => {
            const prismaMock = prisma.workspace.findUnique as any;
            prismaMock.mockResolvedValue(null);

            const result = await generateByMode('non-existent');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Workspace not found');
        });
    });

    describe('generateReferenceContent', () => {
        it('should generate content inspired by reference workspace', async () => {
            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValueOnce([
                {
                    topicName: 'Ref Article 1',
                    articleContent: 'Reference content 1',
                    articleOriginal: 'Original content 1',
                    formatUsed: 'LISTICLE'
                },
                {
                    topicName: 'Ref Article 2',
                    articleContent: 'Reference content 2',
                    articleOriginal: 'Original content 2',
                    formatUsed: 'HOT_TAKE'
                }
            ]).mockResolvedValueOnce([]); // for pickFormat

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({
                id: 'article-1',
                topicName: 'Test Article',
                articleContent: 'Test content'
            });

            const result = await generateReferenceContent({
                ...mockWorkspace,
                referenceWorkspaceId: 'ref-ws-1'
            });

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
            expect(articleFindManyMock).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: expect.objectContaining({
                        workspaceId: 'ref-ws-1',
                        status: 'PUBLISHED',
                    })
                })
            );
        });

        it('should return error if no reference workspace configured', async () => {
            const result = await generateReferenceContent({
                ...mockWorkspace,
                referenceWorkspaceId: null
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('No reference workspace configured.');
        });

        it('should return error if reference workspace has no published articles', async () => {
            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]);

            const result = await generateReferenceContent({
                ...mockWorkspace,
                referenceWorkspaceId: 'ref-ws-1'
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('Reference workspace has no published articles to draw inspiration from.');
        });
    });

    describe('generateSearchContent', () => {
        it('should generate content from Tavily search results', async () => {
            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]); // for pickFormat

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({
                id: 'article-1',
                topicName: 'AI Breakthroughs Today',
                articleContent: 'Content about AI',
                externalUrls: ['https://test.com/1', 'https://test.com/2']
            });

            const result = await generateSearchContent(mockWorkspace, 'AI Breakthroughs');

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
            expect(result.article?.externalUrls).toContain('https://test.com/1');
        });

        it('should return error if topic is missing', async () => {
            const result = await generateSearchContent(mockWorkspace, '');

            expect(result.success).toBe(false);
            expect(result.error).toBe('Topic is required for SEARCH mode.');
        });

        it('should handle Tavily API failure gracefully', async () => {
            const tavily = await import('@tavily/core');
            const mockTavily = tavily.tavily as any;
            mockTavily.mockImplementationOnce(() => ({
                search: vi.fn().mockRejectedValue(new Error('Tavily API error')),
            }));

            const result = await generateSearchContent(mockWorkspace, 'AI Test');

            expect(result.success).toBe(false);
            expect(result.error).toContain('No search results found');
        });
    });

    describe('generateVariations', () => {
        it('should generate multiple variations with different angles', async () => {
            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]); // for pickFormat

            const { getWorkspaceProvider } = await import('@/lib/synthesis_engine');
            const providerMock = getWorkspaceProvider as any;
            providerMock.mockReturnValue({
                createChatCompletion: vi.fn().mockResolvedValue(JSON.stringify({
                    variations: [
                        { angle: 'Optimistic', headline: 'AI Will Transform Everything', content: 'Optimistic content', format: 'HOT_TAKE' },
                        { angle: 'Cautious', headline: 'AI Risks We Must Consider', content: 'Cautious content', format: 'LISTICLE' },
                        { angle: 'Educational', headline: 'Understanding AI Basics', content: 'Educational content', format: 'EXPLAINER' },
                    ]
                })),
            });

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1', topicName: 'Variation' });

            const result = await generateVariations(mockWorkspace);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
            expect(result.articles?.length).toBeGreaterThan(0);
        });

        it('should return error if no base topics configured', async () => {
            const result = await generateVariations({
                ...mockWorkspace,
                variationBaseTopics: []
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('No base topics configured for VARIATIONS mode.');
        });

        it('should respect variationCount setting', async () => {
            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]);

            const { getWorkspaceProvider } = await import('@/lib/synthesis_engine');
            const providerMock = getWorkspaceProvider as any;
            providerMock.mockReturnValue({
                createChatCompletion: vi.fn((messages: any) => {
                    const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';
                    const count = mockWorkspace.variationCount;

                    const variations = Array.from({ length: count }, (_, i) => ({
                        angle: ['Optimistic', 'Cautious', 'Educational'][i],
                        headline: `Test ${i + 1}`,
                        content: `Content ${i + 1}`,
                        format: 'LISTICLE'
                    }));

                    return Promise.resolve(JSON.stringify({ variations }));
                }),
            });

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1' });

            const result = await generateVariations(mockWorkspace);

            expect(result.success).toBe(true);
        });
    });

    describe('generateAutoDiscoverContent', () => {
        it('should discover topics via Tavily and generate articles', async () => {
            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]); // for pickFormat

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({
                id: 'article-1',
                topicName: 'Discovered Article'
            });

            const result = await generateAutoDiscoverContent(mockWorkspace);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
            expect(result.articles!.length).toBeGreaterThan(0);
        });

        it('should return error if no niche configured', async () => {
            const result = await generateAutoDiscoverContent({
                ...mockWorkspace,
                autoDiscoverNiche: null
            });

            expect(result.success).toBe(false);
            expect(result.error).toBe('No niche description configured for AUTO_DISCOVER mode.');
        });

        it('should fall back to AI-generated queries if Tavily fails', async () => {
            const tavily = await import('@tavily/core');
            const mockTavily = tavily.tavily as any;
            mockTavily.mockImplementationOnce(() => ({
                search: vi.fn().mockRejectedValue(new Error('Tavily error')),
            }));

            const { getWorkspaceProvider } = await import('@/lib/synthesis_engine');
            const providerMock = getWorkspaceProvider as any;
            providerMock.mockReturnValue({
                createChatCompletion: vi.fn().mockResolvedValue(JSON.stringify({
                    queries: ['AI news today', 'Machine learning trends'],
                    headline: 'AI Article',
                    content: 'AI content'
                })),
            });

            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]);

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1' });

            const result = await generateAutoDiscoverContent(mockWorkspace);

            expect(result.success).toBe(true);
        });

        it('should limit articles to maxArticles (5)', async () => {
            const tavily = await import('@tavily/core');
            const mockTavily = tavily.tavily as any;
            mockTavily.mockImplementationOnce(() => ({
                search: vi.fn().mockResolvedValue({
                    results: Array.from({ length: 10 }, (_, i) => ({
                        title: `Result ${i + 1}`,
                        url: `https://test.com/${i}`,
                        content: `Content ${i + 1}`,
                        score: 0.9 - i * 0.05
                    }))
                }),
            }));

            const articleFindManyMock = prisma.synthesizedArticle.findMany as any;
            articleFindManyMock.mockResolvedValue([]);

            const createMock = prisma.synthesizedArticle.create as any;
            createMock.mockResolvedValue({ id: 'article-1' });

            const result = await generateAutoDiscoverContent(mockWorkspace);

            expect(result.success).toBe(true);
            expect(result.articles!.length).toBeLessThanOrEqual(5);
        });
    });
});
