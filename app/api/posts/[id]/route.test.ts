import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, PATCH, DELETE } from './route';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';

const mockAuth = auth as any;
const mockPrisma = prisma as any;

describe('Post API /api/posts/[id]', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    const createMockRequest = (method: string, body?: any) => {
        return {
            method,
            json: async () => body,
        } as any;
    };

    const params = Promise.resolve({ id: 'test-post' });

    describe('DELETE', () => {
        it('returns 401 if unauthorized', async () => {
            mockAuth.mockResolvedValueOnce(null);
            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });
            expect(res.status).toBe(401);
            expect(res.body).toEqual({ error: 'Unauthorized' });
        });

        it('returns 404 if post not found', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.post.findUnique.mockResolvedValueOnce(null);

            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });

            expect(res.status).toBe(404);
            expect(res.body).toEqual({ error: 'Post not found' });
        });

        it('returns 403 if user does not own workspace', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            const mockPost = { workspace: { ownerId: 'user2' } };
            mockPrisma.post.findUnique.mockResolvedValueOnce(mockPost);

            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });

            expect(res.status).toBe(403);
            expect(res.body).toEqual({ error: 'Forbidden' });
        });

        it('deletes post successfully if owner', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.post.findUnique.mockResolvedValueOnce({
                workspace: { ownerId: 'user1' }
            });
            mockPrisma.post.delete.mockResolvedValueOnce({});

            const req = createMockRequest('DELETE');
            const res = await DELETE(req, { params });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({ success: true });
            expect(mockPrisma.post.delete).toHaveBeenCalledWith({
                where: { id: 'test-post' }
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

        it('updates allowed fields correctly based on ownership', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.post.findUnique.mockResolvedValueOnce({
                workspace: { ownerId: 'user1' }
            });
            mockPrisma.post.update.mockResolvedValueOnce({ id: 'test-post', status: 'APPROVED' });

            const body = {
                contentOriginal: "Original Text",
                contentTranslated: "Translated Text",
                status: "APPROVED",
                randomUnallowedField: "should-be-ignored"
            };
            const req = createMockRequest('PATCH', body);
            const res = await PATCH(req, { params });

            expect(res.status).toBe(200);
            expect(mockPrisma.post.update).toHaveBeenCalledWith({
                where: { id: 'test-post' },
                data: {
                    status: 'APPROVED',
                    contentOriginal: 'Original Text',
                    contentTranslated: 'Translated Text'
                } // The random field is ignored by the logic in route.ts
            });
        });

        it('sets publishedAt when status is PUBLISHED', async () => {
            mockAuth.mockResolvedValueOnce({ user: { id: 'user1' } });
            mockPrisma.post.findUnique.mockResolvedValueOnce({
                workspace: { ownerId: 'user1' }
            });
            mockPrisma.post.update.mockResolvedValueOnce({ id: 'test-post', status: 'PUBLISHED' });

            const req = createMockRequest('PATCH', { status: 'PUBLISHED' });
            const res = await PATCH(req, { params });

            expect(res.status).toBe(200);
            // We ensure data.publishedAt was passed as a Date
            const callArgs = mockPrisma.post.update.mock.calls[0][0];
            expect(callArgs.data.status).toBe('PUBLISHED');
            expect(callArgs.data.publishedAt).toBeInstanceOf(Date);
        });
    });
});
