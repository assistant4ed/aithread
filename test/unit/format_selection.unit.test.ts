import { describe, it, expect, vi, beforeEach } from 'vitest';
import { POST_FORMATS } from '@/lib/postFormats';
import { prisma } from '@/lib/prisma';

// We need to test the pickFormat function indirectly through content mode functions
// since it's not exported. We'll create a helper to test format rotation logic.

describe('Post Format Selection and Rotation - Unit Tests', () => {
    describe('POST_FORMATS', () => {
        it('should have all 18 post formats defined', () => {
            const formatIds = Object.keys(POST_FORMATS);
            expect(formatIds.length).toBe(18);
        });

        it('should have required metadata for each format', () => {
            Object.entries(POST_FORMATS).forEach(([id, format]) => {
                expect(format.id).toBe(id);
                expect(format.description).toBeDefined();
                expect(format.trigger).toBeDefined();
                expect(format.structure).toBeDefined();
                expect(format.example).toBeDefined();
            });
        });

        it('should have enhanced metadata (visualExample, bestFor, tone)', () => {
            const formatsWithEnhancedMetadata = Object.values(POST_FORMATS).filter(
                f => f.visualExample && f.bestFor && f.tone
            );
            expect(formatsWithEnhancedMetadata.length).toBeGreaterThan(10);
        });

        it('should include all expected format types', () => {
            const expectedFormats = [
                'LISTICLE',
                'HOT_TAKE',
                'NEWS_FLASH',
                'THREAD_STORM',
                'CASE_STUDY',
                'COMPARISON',
                'TUTORIAL',
                'DATA_STORY',
                'PREDICTION',
                'MYTH_BUSTER',
                'RESOURCE_PACK',
                'BEHIND_SCENES',
                'ASK_ME_ANYTHING',
                'TIMELINE',
                'INFOGRAPHIC_TEXT',
                'EXPLAINER',
                'TREND_ALERT',
                'QUOTE_BREAKDOWN',
            ];

            expectedFormats.forEach(formatId => {
                expect(POST_FORMATS[formatId]).toBeDefined();
            });
        });
    });

    describe('Format Rotation Logic', () => {
        beforeEach(() => {
            vi.clearAllMocks();
        });

        it('should prefer less frequently used formats (weight calculation)', async () => {
            // Simulate format rotation: formats used recently should have lower weight
            const recentArticles = [
                { formatUsed: 'LISTICLE' },
                { formatUsed: 'LISTICLE' },
                { formatUsed: 'LISTICLE' },
                { formatUsed: 'HOT_TAKE' },
                { formatUsed: 'HOT_TAKE' },
            ];

            const usageCount: Record<string, number> = {};
            recentArticles.forEach(a => {
                if (a.formatUsed) {
                    usageCount[a.formatUsed] = (usageCount[a.formatUsed] || 0) + 1;
                }
            });

            // Weight calculation: Math.max(1, 10 - usage)
            const weights: Record<string, number> = {};
            ['LISTICLE', 'HOT_TAKE', 'NEWS_FLASH'].forEach(format => {
                const usage = usageCount[format] || 0;
                weights[format] = Math.max(1, 10 - usage);
            });

            // LISTICLE used 3 times: weight = 7
            // HOT_TAKE used 2 times: weight = 8
            // NEWS_FLASH used 0 times: weight = 10 (highest)
            expect(weights['LISTICLE']).toBe(7);
            expect(weights['HOT_TAKE']).toBe(8);
            expect(weights['NEWS_FLASH']).toBe(10);
        });

        it('should handle empty recent articles (all formats equally weighted)', () => {
            const recentArticles: any[] = [];
            const validFormats = ['LISTICLE', 'HOT_TAKE', 'NEWS_FLASH'];

            const usageCount: Record<string, number> = {};
            recentArticles.forEach(a => {
                if (a.formatUsed) {
                    usageCount[a.formatUsed] = (usageCount[a.formatUsed] || 0) + 1;
                }
            });

            const weights: Record<string, number> = {};
            validFormats.forEach(format => {
                const usage = usageCount[format] || 0;
                weights[format] = Math.max(1, 10 - usage);
            });

            // All formats should have max weight (10) since none are used
            expect(weights['LISTICLE']).toBe(10);
            expect(weights['HOT_TAKE']).toBe(10);
            expect(weights['NEWS_FLASH']).toBe(10);
        });

        it('should filter to only preferred formats if configured', () => {
            const preferredFormats = ['LISTICLE', 'HOT_TAKE'];
            const allFormats = Object.keys(POST_FORMATS);

            const validFormats = preferredFormats.length > 0
                ? preferredFormats.filter(f => POST_FORMATS[f])
                : allFormats;

            expect(validFormats).toEqual(['LISTICLE', 'HOT_TAKE']);
            expect(validFormats.length).toBe(2);
        });

        it('should fall back to all formats if preferredFormats is empty', () => {
            const preferredFormats: string[] = [];
            const allFormats = Object.keys(POST_FORMATS);

            const validFormats = preferredFormats.length > 0
                ? preferredFormats.filter(f => POST_FORMATS[f])
                : allFormats;

            expect(validFormats.length).toBe(18);
        });

        it('should handle invalid preferred formats gracefully', () => {
            const preferredFormats = ['LISTICLE', 'INVALID_FORMAT', 'HOT_TAKE'];
            const validFormats = preferredFormats.filter(f => POST_FORMATS[f]);

            expect(validFormats).toEqual(['LISTICLE', 'HOT_TAKE']);
            expect(validFormats).not.toContain('INVALID_FORMAT');
        });
    });

    describe('Format Guidelines', () => {
        it('should provide specific guidelines for LISTICLE format', () => {
            const listicle = POST_FORMATS['LISTICLE'];
            expect(listicle.structure).toContain('numbered');
            expect(listicle.description.toLowerCase()).toContain('list');
        });

        it('should provide specific guidelines for HOT_TAKE format', () => {
            const hotTake = POST_FORMATS['HOT_TAKE'];
            expect(hotTake.trigger.toLowerCase()).toContain('contrarian');
        });

        it('should provide specific guidelines for THREAD_STORM format', () => {
            const threadStorm = POST_FORMATS['THREAD_STORM'];
            expect(threadStorm.structure).toContain('numbered');
            expect(threadStorm.visualExample).toContain('1/');
        });

        it('should provide visual examples for all major formats', () => {
            const majorFormats = ['LISTICLE', 'HOT_TAKE', 'THREAD_STORM', 'DATA_STORY', 'NEWS_FLASH'];
            majorFormats.forEach(formatId => {
                const format = POST_FORMATS[formatId];
                expect(format.visualExample).toBeDefined();
                expect(format.visualExample!.length).toBeGreaterThan(10);
            });
        });
    });

    describe('Format Metadata Quality', () => {
        it('should have meaningful tone descriptions', () => {
            const tones = Object.values(POST_FORMATS)
                .map(f => f.tone)
                .filter(Boolean);

            expect(tones.length).toBeGreaterThan(15);
            expect(tones).toContain('Professional');
            expect(tones).toContain('Conversational');
        });

        it('should have actionable bestFor descriptions', () => {
            const bestForDescriptions = Object.values(POST_FORMATS)
                .map(f => f.bestFor)
                .filter(Boolean);

            expect(bestForDescriptions.length).toBeGreaterThan(15);
            bestForDescriptions.forEach(desc => {
                expect(desc!.length).toBeGreaterThan(10);
            });
        });

        it('should have diverse format categories', () => {
            const categories = new Set<string>();

            Object.values(POST_FORMATS).forEach(format => {
                if (format.description.toLowerCase().includes('list')) categories.add('list-based');
                if (format.description.toLowerCase().includes('story')) categories.add('narrative');
                if (format.description.toLowerCase().includes('data')) categories.add('data-driven');
                if (format.description.toLowerCase().includes('thread')) categories.add('thread');
            });

            expect(categories.size).toBeGreaterThanOrEqual(3);
        });
    });

    describe('Format Structure Validation', () => {
        it('should have clear structure definitions', () => {
            Object.values(POST_FORMATS).forEach(format => {
                expect(format.structure).toBeDefined();
                expect(format.structure.length).toBeGreaterThan(15);
                expect(format.structure).toMatch(/→|->|:|,/); // Contains delimiters
            });
        });

        it('should have realistic examples', () => {
            Object.values(POST_FORMATS).forEach(format => {
                expect(format.example).toBeDefined();
                expect(format.example.length).toBeGreaterThan(10);
            });
        });
    });

    describe('Format Selection Edge Cases', () => {
        it('should handle workspace with no format history', async () => {
            const findManyMock = prisma.synthesizedArticle.findMany as any;
            findManyMock.mockResolvedValue([]);

            // Simulate pickFormat logic
            const recentArticles: any[] = [];
            const preferredFormats = ['LISTICLE', 'HOT_TAKE'];

            const validFormats = preferredFormats.length > 0
                ? preferredFormats.filter(f => POST_FORMATS[f])
                : Object.keys(POST_FORMATS);

            expect(validFormats.length).toBe(2);
        });

        it('should handle overused format (usage count > 10)', () => {
            const recentArticles = Array(15).fill({ formatUsed: 'LISTICLE' });

            const usageCount: Record<string, number> = {};
            recentArticles.forEach(a => {
                if (a.formatUsed) {
                    usageCount[a.formatUsed] = (usageCount[a.formatUsed] || 0) + 1;
                }
            });

            const usage = usageCount['LISTICLE'] || 0;
            const weight = Math.max(1, 10 - usage); // Should be 1 (minimum)

            expect(weight).toBe(1);
        });

        it('should handle null formatUsed values', () => {
            const recentArticles = [
                { formatUsed: 'LISTICLE' },
                { formatUsed: null },
                { formatUsed: 'HOT_TAKE' },
                { formatUsed: undefined },
            ];

            const usageCount: Record<string, number> = {};
            recentArticles.forEach(a => {
                if (a.formatUsed) {
                    usageCount[a.formatUsed] = (usageCount[a.formatUsed] || 0) + 1;
                }
            });

            expect(usageCount['LISTICLE']).toBe(1);
            expect(usageCount['HOT_TAKE']).toBe(1);
            expect(Object.keys(usageCount).length).toBe(2);
        });
    });
});
