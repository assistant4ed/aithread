import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from './route';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

// Mocks are set up in vitest.setup.ts
// We just need to cast them to correct types
const mockAuth = auth as any;
const mockPrisma = prisma as any;

describe('Article API /api/articles/[id]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createMockRequest = (method: string, body?: any) => {
        // Relying on the global mock from vitest.setup.ts
        // next/server is mocked, but we can just pass an object that matches NextRequest
        return {
            method,
            json: async () => body,
        } as any;
    };

    const params = Promise.resolve({ id: 'test-article' });

    describe('DELETE', () => {
        it('returns 401 if unauthorized', async () => {
            mockAuth.mockResolvedValueOnce(null);
            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Unauthorized' });
        });

        it('returns 404 if article not found', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.synthesizedArticle.findUnique.mockResolvedValueOnce(null);

            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'Article not found' });
        });

        it('returns 403 if user does not own workspace', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.synthesizedArticle.findUnique.mockResolvedValueOnce({
                workspace: { ownerId: 'user2' }
            });

            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ error: 'Forbidden' });
        });

        it('deletes article successfully if owner', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.synthesizedArticle.findUnique.mockResolvedValueOnce({
                workspace: { ownerId: 'user1' }
            });
            mockPrisma.synthesizedArticle.delete.mockResolvedValueOnce({});

            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true });
            expect(mockPrisma.synthesizedArticle.delete).toHaveBeenCalledWith({
                where: { id: 'test-article' }
            });
        });
    });

    describe('PATCH', () => {
        it('returns 401 if unauthorized', async () => {
            mockAuth.mockResolvedValueOnce(null);
            const req = createMockRequest('PATCH', { status: 'APPROVED' });
            const res = await PATCH(req, { params });
            expect(res.status).toBe(401);
        });

        it('returns 403 if user does not own workspace', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.synthesizedArticle.findUnique.mockResolvedValueOnce({
                workspace: { ownerId: 'user2' }
            });

            const req = createMockRequest('PATCH', { status: 'APPROVED' });
            const res = await PATCH(req, { params });

            expect(res.status).toBe(403);
        });

        it('updates article schedule successfully', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.synthesizedArticle.findUnique.mockResolvedValueOnce({
                workspace: { ownerId: 'user1' }
            });
            mockPrisma.synthesizedArticle.update.mockResolvedValueOnce({ id: 'test-article', status: 'APPROVED' });

            const body = { scheduledPublishAt: '2026-02-22T14:00:00Z' };
            const req = createMockRequest('PATCH', body);
            const res = await PATCH(req, { params });

            expect(res.status).toBe(200);
            expect(mockPrisma.synthesizedArticle.update).toHaveBeenCalledWith({
                where: { id: 'test-article' },
                data: body
            });
        });
    });
});
