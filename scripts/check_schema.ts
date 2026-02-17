
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
    try {
        const count = await prisma.synthesizedArticle.count();
        console.log(`Table exists! SynthesizedArticles: ${count}`);
    } catch (e: any) {
        console.log(`Table does not exist. Error: ${e.message}`);
    } finally {
        await prisma.$disconnect();
    }
}
main();
