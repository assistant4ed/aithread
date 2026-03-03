import { vi, beforeAll, expect } from 'vitest';

const isIntegrationOrE2E = expect.getState().testPath?.includes('.integration.test.ts') ||
    expect.getState().testPath?.includes('.e2e.test.ts');

if (isIntegrationOrE2E) {
    const testUrl = "postgresql://postgres:password@127.0.0.1:5432/postgres?sslmode=disable";
    process.env.DATABASE_URL = testUrl;
    process.env.DIRECT_URL = testUrl;
}

import { setupTestDB } from './test/setup/db.setup';

vi.mock('@/auth', () => ({
    auth: vi.fn(),
}));


vi.mock('@/lib/prisma', async (importOriginal) => {
    const isIntegrationOrE2E = expect.getState().testPath?.includes('.integration.test.ts') ||
        expect.getState().testPath?.includes('.e2e.test.ts');

    if (isIntegrationOrE2E) {
        return (await importOriginal()) as any;
    }

    return {
        prisma: {
            synthesizedArticle: {
                findUnique: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                create: vi.fn(),
                upsert: vi.fn(),
                findFirst: vi.fn(),
                findMany: vi.fn(),
            },
            post: {
                findUnique: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                create: vi.fn(),
                upsert: vi.fn(),
                findFirst: vi.fn(),
                findMany: vi.fn(),
                count: vi.fn(),
            },
            workspace: {
                findUnique: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                create: vi.fn(),
                upsert: vi.fn(),
                findFirst: vi.fn(),
                findMany: vi.fn(),
            },
            scraperSource: {
                findUnique: vi.fn(),
                update: vi.fn(),
                delete: vi.fn(),
                create: vi.fn(),
                upsert: vi.fn(),
                findFirst: vi.fn(),
                findMany: vi.fn(),
            },
            scrapeLog: {
                create: vi.fn(),
            },
            trackedAccount: {
                findUnique: vi.fn(),
                upsert: vi.fn(),
            },
        },
    };
});

beforeAll(async () => {
    if (isIntegrationOrE2E) {
        await setupTestDB();
    }
}, 60000);

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
