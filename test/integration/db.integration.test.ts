import { describe, it, expect, beforeEach, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { clearTestData } from '../setup/db.setup';

vi.unmock('@/lib/prisma');

describe('Database Integration Tests', () => {
    beforeEach(async () => {
        await clearTestData();
    });

    it('can create and retrieve a workspace', async () => {
        const workspace = await prisma.workspace.create({
            data: {
                name: 'Test Workspace',
                translationPrompt: 'Test Prompt',
            },
        });

        expect(workspace.id).toBeDefined();
        expect(workspace.name).toBe('Test Workspace');

        const found = await prisma.workspace.findUnique({
            where: { id: workspace.id },
        });
        expect(found?.name).toBe('Test Workspace');
    });

    it('can create threads posts and query them', async () => {
        const ws = await prisma.workspace.create({
            data: { name: 'WS1', translationPrompt: '...' }
        });

        await prisma.post.create({
            data: {
                threadId: 'post1',
                workspaceId: ws.id,
                sourceAccount: 'testuser',
                contentOriginal: 'Hello world',
                likes: 10,
                views: 100,
            }
        });

        const posts = await prisma.post.findMany({
            where: { workspaceId: ws.id }
        });

        expect(posts.length).toBe(1);
        expect(posts[0].contentOriginal).toBe('Hello world');
    });
});
