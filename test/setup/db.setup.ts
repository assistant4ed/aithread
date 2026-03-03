import { execSync } from 'child_process';
import { prisma } from '@/lib/prisma';

/**
 * Global setup for database integration tests.
 * This runs before any integration tests start.
 */
export async function setupTestDB() {
    console.log('--- Setting up Test Database ---');
    const testUrl = "postgresql://postgres:password@127.0.0.1:5432/postgres?sslmode=disable";
    process.env.DATABASE_URL = testUrl;
    process.env.DIRECT_URL = testUrl;

    let attempts = 0;
    const maxAttempts = 10;

    while (attempts < maxAttempts) {
        try {
            console.log(`Running Prisma migrations on test DB (Attempt ${attempts + 1}/${maxAttempts})...`);
            execSync('npx prisma db push --skip-generate --accept-data-loss', {
                stdio: 'inherit',
                env: {
                    ...process.env,
                    DATABASE_URL: testUrl,
                }
            });
            console.log('Test DB Ready.');
            return;
        } catch (error: any) {
            attempts++;
            const errorMsg = error.stderr?.toString() || error.message;
            console.warn(`Attempt ${attempts} failed: ${errorMsg.slice(0, 200)}`);

            if (attempts >= maxAttempts) {
                throw new Error(`Failed to setup test database after ${maxAttempts} attempts: ${errorMsg}`);
            }
            console.log('DB not ready yet, retrying in 2 seconds...');
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}

/**
 * Helper to clear data between tests
 */
export async function clearTestData() {
    const tablenames = await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_tables WHERE schemaname='public'
    `;

    const tables = tablenames
        .map(({ tablename }) => tablename)
        .filter((name) => name !== '_prisma_migrations')
        .map((name) => `"public"."${name}"`)
        .join(', ');

    if (!tables) return;

    try {
        await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables} CASCADE;`);
    } catch (error) {
        console.error('Error clearing test data:', error);
    }
}
