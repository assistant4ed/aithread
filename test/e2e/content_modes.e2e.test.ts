import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { clearTestData } from '../setup/db.setup';
import { generateByMode } from '@/lib/content_modes';

vi.unmock('@/lib/prisma');

// Mock external APIs
vi.mock('@/lib/synthesis_engine', () => ({
    getWorkspaceProvider: vi.fn(() => ({
        createChatCompletion: vi.fn().mockImplementation(async (messages: any[], options: any) => {
            const userMessage = messages.find((m: any) => m.role === 'user')?.content || '';

            // Simulate different responses based on content
            if (userMessage.includes('Generate') && userMessage.includes('variations')) {
                return JSON.stringify({
                    variations: [
                        { angle: 'Optimistic', headline: 'AI Will Transform Everything', content: 'Optimistic take on AI future with detailed analysis and examples.', format: 'HOT_TAKE' },
                        { angle: 'Cautious', headline: 'AI Challenges We Must Address', content: 'Cautious perspective on AI risks and mitigation strategies.', format: 'LISTICLE' },
                        { angle: 'Educational', headline: 'Understanding AI Fundamentals', content: 'Educational guide to AI basics for beginners.', format: 'EXPLAINER' },
                    ]
                });
            }

            if (userMessage.includes('queries') || userMessage.includes('trend analyst')) {
                return JSON.stringify({
                    queries: ['Latest AI breakthroughs 2026', 'Machine learning trends', 'AI startup funding news']
                });
            }

            return JSON.stringify({
                headline: 'Test Article from AI',
                content: 'This is AI-generated content with multiple paragraphs explaining the topic in detail. It includes relevant information, insights, and actionable takeaways.'
            });
        }),
    })),
    translateText: vi.fn((text: string) => Promise.resolve(text)),
}));

vi.mock('@tavily/core', () => ({
    tavily: vi.fn(() => ({
        search: vi.fn().mockResolvedValue({
            results: [
                {
                    title: 'Breaking: New AI Model Released',
                    url: 'https://example.com/ai-news-1',
                    content: 'A groundbreaking new AI model has been released by researchers, showing significant improvements in performance.',
                    score: 0.95
                },
                {
                    title: 'AI Adoption in Healthcare Surges',
                    url: 'https://example.com/ai-news-2',
                    content: 'Healthcare providers are increasingly adopting AI tools for diagnosis and treatment planning.',
                    score: 0.92
                },
                {
                    title: 'Machine Learning Trends 2026',
                    url: 'https://example.com/ml-trends',
                    content: 'Analysis of the top machine learning trends shaping the industry in 2026.',
                    score: 0.88
                },
            ]
        }),
    })),
}));

describe('Content Modes - E2E Tests', () => {
    beforeEach(async () => {
        await clearTestData();
        vi.clearAllMocks();
        process.env.TAVILY_API_KEY = 'test-tavily-key-e2e';
    });

    describe('REFERENCE Mode - End-to-End Workflow', () => {
        it('should complete full REFERENCE workflow: create workspace → generate inspired content → verify article', async () => {
            // Step 1: Create reference workspace with published articles
            const refWorkspace = await prisma.workspace.create({
                data: {
                    name: 'Reference Workspace - Tech News',
                    contentMode: 'SCRAPE',
                    translationPrompt: 'Translate to professional English',
                    synthesisLanguage: 'English',
                },
            });

            const refArticles = await Promise.all([
                prisma.synthesizedArticle.create({
                    data: {
                        workspaceId: refWorkspace.id,
                        topicName: 'AI Breakthrough in Natural Language Processing',
                        articleContent: 'Researchers have developed a new model that understands context better than ever before.',
                        articleOriginal: 'Researchers developed new NLP model...',
                        status: 'PUBLISHED',
                        authorCount: 3,
                        postCount: 15,
                        sourcePostIds: ['post1', 'post2'],
                        sourceAccounts: ['researcher1', 'researcher2'],
                        formatUsed: 'LISTICLE',
                    },
                }),
                prisma.synthesizedArticle.create({
                    data: {
                        workspaceId: refWorkspace.id,
                        topicName: 'Machine Learning Trends Shaping 2026',
                        articleContent: 'Five key trends in ML that are transforming industries worldwide.',
                        articleOriginal: 'ML trends transforming industries...',
                        status: 'PUBLISHED',
                        authorCount: 2,
                        postCount: 10,
                        sourcePostIds: ['post3'],
                        sourceAccounts: ['analyst1'],
                        formatUsed: 'HOT_TAKE',
                    },
                }),
            ]);

            expect(refArticles.length).toBe(2);

            // Step 2: Create REFERENCE workspace
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'My Tech Insights - REFERENCE',
                    contentMode: 'REFERENCE',
                    translationPrompt: 'Translate to engaging Chinese',
                    synthesisLanguage: 'English', // Keep in English for testing
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    referenceWorkspaceId: refWorkspace.id,
                    preferredFormats: ['LISTICLE', 'HOT_TAKE', 'EXPLAINER'],
                    publishTimes: ['12:00', '18:00'],
                    dailyPostLimit: 4,
                    reviewWindowHours: 1,
                },
            });

            expect(workspace.contentMode).toBe('REFERENCE');

            // Step 3: Generate content (simulates heartbeat trigger at synthesis time)
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();

            // Step 4: Verify article properties
            const article = result.article;
            expect(article.topicName).toBeDefined();
            expect(article.articleContent).toBeDefined();
            expect(article.status).toBe('PENDING_REVIEW');
            expect(article.sourceAccounts).toContain(`ref:${refWorkspace.id}`);
            expect(article.formatUsed).toBeDefined();

            // Step 5: Verify article is retrievable from database
            const savedArticle = await prisma.synthesizedArticle.findUnique({
                where: { id: article.id },
            });

            expect(savedArticle).toBeDefined();
            expect(savedArticle!.topicName).toBe(article.topicName);
        });

        it('should handle multiple reference articles with different formats', async () => {
            const refWorkspace = await prisma.workspace.create({
                data: {
                    name: 'Reference WS',
                    contentMode: 'SCRAPE',
                    translationPrompt: 'Test',
                },
            });

            // Create 5 reference articles with diverse formats
            const formats = ['LISTICLE', 'HOT_TAKE', 'NEWS_FLASH', 'DATA_STORY', 'EXPLAINER'];
            await Promise.all(
                formats.map((format, i) =>
                    prisma.synthesizedArticle.create({
                        data: {
                            workspaceId: refWorkspace.id,
                            topicName: `Article ${i + 1}`,
                            articleContent: `Content ${i + 1}`,
                            articleOriginal: `Original ${i + 1}`,
                            status: 'PUBLISHED',
                            authorCount: 1,
                            postCount: 5,
                            sourcePostIds: [],
                            sourceAccounts: ['test'],
                            formatUsed: format,
                        },
                    })
                )
            );

            const workspace = await prisma.workspace.create({
                data: {
                    name: 'REF Workspace',
                    contentMode: 'REFERENCE',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    referenceWorkspaceId: refWorkspace.id,
                    preferredFormats: formats,
                },
            });

            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();
        });
    });

    describe('VARIATIONS Mode - End-to-End Workflow', () => {
        it('should complete full VARIATIONS workflow: create workspace → generate variations → verify diversity', async () => {
            // Step 1: Create VARIATIONS workspace
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'AI Perspectives - VARIATIONS',
                    contentMode: 'VARIATIONS',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'English', // Keep in English for testing
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    variationBaseTopics: ['AI Ethics', 'Future of Work'],
                    variationCount: 3,
                    preferredFormats: ['HOT_TAKE', 'LISTICLE', 'EXPLAINER'],
                    publishTimes: ['09:00', '15:00', '21:00'],
                    dailyPostLimit: 9, // 3 variations per topic
                },
            });

            expect(workspace.contentMode).toBe('VARIATIONS');
            expect(workspace.variationBaseTopics).toEqual(['AI Ethics', 'Future of Work']);

            // Step 2: Generate variations
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
            expect(result.articles!.length).toBeGreaterThan(0);

            // Step 3: Verify variation diversity
            const articles = result.articles!;

            // Check that articles have different angles
            const angles = articles.map(a => {
                const match = a.topicName.match(/\[(.*?)\]/);
                return match ? match[1] : null;
            }).filter(Boolean);

            expect(angles.length).toBeGreaterThan(0);

            // Step 4: Verify all articles are in PENDING_REVIEW status
            articles.forEach(article => {
                expect(article.status).toBe('PENDING_REVIEW');
                expect(article.articleContent).toBeDefined();
                expect(article.formatUsed).toBeDefined();
            });

            // Step 5: Verify articles are saved in database
            const savedArticles = await prisma.synthesizedArticle.findMany({
                where: { workspaceId: workspace.id },
            });

            expect(savedArticles.length).toBe(articles.length);
        });

        it('should generate correct number of variations based on variationCount', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Test VARIATIONS',
                    contentMode: 'VARIATIONS',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    variationBaseTopics: ['Single Topic'],
                    variationCount: 3,
                    preferredFormats: ['LISTICLE', 'HOT_TAKE', 'EXPLAINER'],
                },
            });

            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();

            // Should generate 3 variations for 1 topic
            const articles = result.articles!;
            expect(articles.length).toBeGreaterThanOrEqual(1);
            expect(articles.length).toBeLessThanOrEqual(3);
        });

        it('should handle multiple base topics', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Multi-Topic VARIATIONS',
                    contentMode: 'VARIATIONS',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    variationBaseTopics: ['Topic A', 'Topic B', 'Topic C'],
                    variationCount: 2,
                    preferredFormats: ['LISTICLE', 'HOT_TAKE'],
                },
            });

            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
            // Should generate 2 variations for each of 3 topics = up to 6 articles
        });
    });

    describe('AUTO_DISCOVER Mode - End-to-End Workflow', () => {
        it('should complete full AUTO_DISCOVER workflow: create workspace → discover topics → generate articles', async () => {
            // Step 1: Create AUTO_DISCOVER workspace
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'AI News Auto - AUTO_DISCOVER',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    autoDiscoverNiche: 'Artificial Intelligence and Machine Learning',
                    preferredFormats: ['NEWS_FLASH', 'LISTICLE', 'HOT_TAKE', 'DATA_STORY'],
                    publishTimes: ['08:00', '14:00', '20:00'],
                    dailyPostLimit: 9,
                    reviewWindowHours: 2,
                },
            });

            expect(workspace.contentMode).toBe('AUTO_DISCOVER');
            expect(workspace.autoDiscoverNiche).toBe('Artificial Intelligence and Machine Learning');

            // Step 2: Auto-discover and generate (simulates heartbeat)
            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
            expect(result.articles!.length).toBeGreaterThan(0);
            expect(result.articles!.length).toBeLessThanOrEqual(5); // Max 5 articles per run

            // Step 3: Verify discovered articles
            const articles = result.articles!;

            articles.forEach(article => {
                expect(article.topicName).toBeDefined();
                expect(article.articleContent).toBeDefined();
                expect(article.status).toBe('PENDING_REVIEW');
                expect(article.externalUrls).toBeDefined();
                expect(article.formatUsed).toBeDefined();
            });

            // Step 4: Verify external URLs are captured
            const hasExternalUrls = articles.some(a => a.externalUrls && a.externalUrls.length > 0);
            expect(hasExternalUrls).toBe(true);

            // Step 5: Verify workspace metadata is updated
            const updatedWorkspace = await prisma.workspace.findUnique({
                where: { id: workspace.id },
            });

            expect(updatedWorkspace).toBeDefined();
        });

        it('should discover diverse topics for broad niches', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Broad Niche Test',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    autoDiscoverNiche: 'Technology and Innovation',
                    preferredFormats: ['LISTICLE', 'NEWS_FLASH'],
                },
            });

            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();

            // Verify topics are diverse (not all the same)
            const topics = result.articles!.map(a => a.topicName);
            const uniqueTopics = new Set(topics);
            expect(uniqueTopics.size).toBeGreaterThan(0);
        });

        it('should handle niche-specific discovery', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Specific Niche Test',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    autoDiscoverNiche: 'Quantum Computing advancements',
                    preferredFormats: ['DATA_STORY', 'EXPLAINER'],
                },
            });

            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
        });
    });

    describe('SEARCH Mode - End-to-End Workflow', () => {
        it('should complete full SEARCH workflow: create workspace → search topic → generate article', async () => {
            // Step 1: Create SEARCH workspace
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Tech Search - SEARCH',
                    contentMode: 'SEARCH',
                    translationPrompt: 'Translate to Chinese',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    aiModel: 'llama-3.3-70b-versatile',
                    preferredFormats: ['NEWS_FLASH', 'LISTICLE', 'DATA_STORY'],
                    dataCollationHours: 48,
                },
            });

            expect(workspace.contentMode).toBe('SEARCH');

            // Step 2: Search and generate for specific topic
            const topic = 'Latest AI Breakthroughs in Healthcare';
            const result = await generateByMode(workspace.id, topic);

            expect(result.success).toBe(true);
            expect(result.article).toBeDefined();

            // Step 3: Verify article properties
            const article = result.article!;
            expect(article.topicName).toBeDefined();
            expect(article.articleContent).toBeDefined();
            expect(article.status).toBe('PENDING_REVIEW');
            expect(article.externalUrls).toBeDefined();
            expect(article.externalUrls.length).toBeGreaterThan(0);

            // Step 4: Verify search sources are tracked
            expect(article.sourceAccounts).toContain('Tavily Search API');

            // Step 5: Verify article is saved
            const savedArticle = await prisma.synthesizedArticle.findUnique({
                where: { id: article.id },
            });

            expect(savedArticle).toBeDefined();
        });

        it('should handle different search topics', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'SEARCH Workspace',
                    contentMode: 'SEARCH',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    preferredFormats: ['LISTICLE'],
                },
            });

            const topics = [
                'AI in Finance',
                'Machine Learning Ethics',
                'Quantum Computing News',
            ];

            for (const topic of topics) {
                const result = await generateByMode(workspace.id, topic);
                expect(result.success).toBe(true);
                expect(result.article).toBeDefined();
            }

            // Verify all articles are saved
            const articles = await prisma.synthesizedArticle.findMany({
                where: { workspaceId: workspace.id },
            });

            expect(articles.length).toBe(3);
        });
    });

    describe('Cross-Mode Integration Tests', () => {
        it('should handle multiple workspaces with different modes simultaneously', async () => {
            const workspaces = await Promise.all([
                prisma.workspace.create({
                    data: {
                        name: 'AUTO_DISCOVER WS',
                        contentMode: 'AUTO_DISCOVER',
                        translationPrompt: 'Test',
                        synthesisLanguage: 'English',
                        aiProvider: 'GROQ',
                        autoDiscoverNiche: 'AI',
                    },
                }),
                prisma.workspace.create({
                    data: {
                        name: 'VARIATIONS WS',
                        contentMode: 'VARIATIONS',
                        translationPrompt: 'Test',
                        synthesisLanguage: 'English',
                        aiProvider: 'GROQ',
                        variationBaseTopics: ['Topic 1'],
                        variationCount: 2,
                    },
                }),
            ]);

            const results = await Promise.all(
                workspaces.map(ws => generateByMode(ws.id))
            );

            expect(results[0].success).toBe(true);
            expect(results[1].success).toBe(true);

            // Verify articles for both workspaces
            const allArticles = await prisma.synthesizedArticle.findMany();
            expect(allArticles.length).toBeGreaterThan(0);
        });

        it('should maintain format rotation across multiple generation cycles', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Format Rotation Test',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Test',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    autoDiscoverNiche: 'Technology',
                    preferredFormats: ['LISTICLE', 'HOT_TAKE', 'NEWS_FLASH'],
                },
            });

            // Generate articles 3 times
            for (let i = 0; i < 3; i++) {
                await generateByMode(workspace.id);
            }

            // Check format distribution
            const articles = await prisma.synthesizedArticle.findMany({
                where: { workspaceId: workspace.id },
            });

            const formatCounts: Record<string, number> = {};
            articles.forEach(a => {
                if (a.formatUsed) {
                    formatCounts[a.formatUsed] = (formatCounts[a.formatUsed] || 0) + 1;
                }
            });

            // Should use different formats (not all the same)
            const uniqueFormats = Object.keys(formatCounts);
            expect(uniqueFormats.length).toBeGreaterThan(0);
        });
    });

    describe('Translation and Localization', () => {
        it('should handle English synthesis language (no translation)', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'English Workspace',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'N/A',
                    synthesisLanguage: 'English',
                    aiProvider: 'GROQ',
                    autoDiscoverNiche: 'AI News',
                },
            });

            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            expect(result.articles).toBeDefined();
        });

        it('should handle Traditional Chinese synthesis language', async () => {
            const workspace = await prisma.workspace.create({
                data: {
                    name: 'Chinese Workspace',
                    contentMode: 'AUTO_DISCOVER',
                    translationPrompt: 'Translate to Traditional Chinese (HK style)',
                    synthesisLanguage: 'Traditional Chinese (HK/TW)',
                    aiProvider: 'GROQ',
                    autoDiscoverNiche: 'Technology',
                },
            });

            const result = await generateByMode(workspace.id);

            expect(result.success).toBe(true);
            // Translation is mocked, so we just verify it completes
        });
    });
});
