import { vi } from 'vitest';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));

vi.mock('@/lib/prisma', () => ({
    prisma: {
        synthesizedArticle: {
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
        post: {
            findUnique: vi.fn(),
            update: vi.fn(),
            delete: vi.fn(),
        },
    },
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn().mockImplementation((body, init) => {
            return {
                body,
                status: init?.status || 200,
            };
        }),
    },
    NextRequest: class MockNextRequest {
        url: string;
        method: string;
        _bodyData: any;

        constructor(url: string, init?: any) {
            this.url = url;
            this.method = init?.method || 'GET';
            this._bodyData = init?.body;
        }

        async json() {
            return typeof this._bodyData === 'string' ? JSON.parse(this._bodyData) : this._bodyData;
        }
    },
}));
