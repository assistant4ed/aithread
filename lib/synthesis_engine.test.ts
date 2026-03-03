import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runSynthesisEngine, checkAutoApproval, clusterPostsWithLLM } from './synthesis_engine';
import { prisma } from './prisma';
import { getProvider } from './ai/provider';
import { toUTCDate } from './time';
import * as clustering from './clustering';

// Mock dependencies
vi.mock('./prisma', () => ({
    prisma: {
        post: {
            findMany: vi.fn(),
            updateMany: vi.fn(),
        },
        workspace: {
            findUnique: vi.fn(),
        },
        synthesizedArticle: {
            create: vi.fn(),
        },
    },
}));

const mockProvider = {
    createChatCompletion: vi.fn(),
};

vi.mock('./ai/provider', () => {
    return {
        getProvider: vi.fn(() => mockProvider),
        FallbackProvider: vi.fn(function () {
            return mockProvider;
        }),
    };
});

vi.mock('./storage', () => ({
    uploadBufferToStorage: vi.fn(),
}));

vi.mock('./clustering', () => ({
    clusterPosts: vi.fn(),
}));

describe('Synthesis Engine Unit Tests', () => {
    const mockSettings = {
        translationPrompt: 'Test translation',
        clusteringPrompt: 'Test clustering',
        synthesisLanguage: 'English',
        postLookbackHours: 24,
        coherenceThreshold: 2,
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('checkAutoApproval', () => {
        it('returns true when AI approves', async () => {
            mockProvider.createChatCompletion.mockResolvedValue(JSON.stringify({ approved: true, reason: 'Good content' }));

            const result = await checkAutoApproval('Title', 'Content', 'Instruction', mockSettings);
            expect(result).toBe(true);
        });

        it('returns false when AI rejects', async () => {
            mockProvider.createChatCompletion.mockResolvedValue(JSON.stringify({ approved: false, reason: 'Spam' }));

            const result = await checkAutoApproval('Title', 'Content', 'Instruction', mockSettings);
            expect(result).toBe(false);
        });

        it('returns false on AI failure (safety first)', async () => {
            mockProvider.createChatCompletion.mockRejectedValue(new Error('AI Down'));

            const result = await checkAutoApproval('Title', 'Content', 'Instruction', mockSettings);
            expect(result).toBe(false);
        });
    });

    describe('Scheduling Logic', () => {
        it('calculates scheduled date correctly in HKT', () => {
            const now = new Date('2026-03-03T10:00:00Z'); // 6:00 PM HKT
            const targetTime = "19:00"; // 7:00 PM HKT
            const scheduled = toUTCDate(targetTime, now);

            // 7:00 PM HKT is 11:00 AM UTC
            expect(scheduled.toISOString()).toContain('T11:00:00.000Z');
            expect(scheduled.getDate()).toBe(3);
        });

        it('schedules for tomorrow if target time is in the past', () => {
            const now = new Date('2026-03-03T12:00:00Z'); // 8:00 PM HKT
            const targetTime = "09:00"; // 9:00 AM HKT (already passed)
            const candidate = toUTCDate(targetTime, now);

            // Simulating runSynthesisEngine's drift logic
            if (candidate.getTime() < now.getTime() - 1000 * 60 * 60) {
                candidate.setDate(candidate.getDate() + 1);
            }

            expect(candidate.getDate()).toBe(4);
        });
    });

    describe('Clustering Logic', () => {
        it('falls back to TF-IDF when LLM returns no clusters', async () => {
            vi.mocked(clustering.clusterPosts).mockReturnValue([{ postIds: ['1', '2'], terms: ['fallback'] }]);

            mockProvider.createChatCompletion.mockResolvedValue(JSON.stringify({ clusters: [] }));

            const docs = [
                { id: '1', text: 'Post 1', sourceType: 'ACCOUNT', sourceId: 'a1' },
                { id: '2', text: 'Post 2', sourceType: 'ACCOUNT', sourceId: 'a2' },
            ];

            const result = await clusterPostsWithLLM(docs, 'Instruction', mockSettings as any);
            expect(clustering.clusterPosts).toHaveBeenCalled();
            expect(result[0].terms[0]).toBe('fallback');
        });
    });
});
