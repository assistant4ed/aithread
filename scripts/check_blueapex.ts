import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
    // Already know: 94 of 98 sources have @, 4 are # topics
    // Now check scrape logs without include
    const sources = await prisma.scraperSource.findMany({
        where: { workspaceId: 'cmm1im9ft0081s0rghyxckio5' },
        select: { id: true, type: true, value: true, isActive: true },
    });
    const sourceIds = sources.map(s => s.id);
    const sourceMap = new Map(sources.map(s => [s.id, s.value]));

    // Logs with posts
    const logsWithPosts = await prisma.scrapeLog.findMany({
        where: { sourceId: { in: sourceIds }, rawCollected: { gt: 0 } },
        orderBy: { createdAt: 'desc' },
        take: 20,
    });
    console.log('=== LOGS WITH POSTS (raw > 0) ===');
    for (const l of logsWithPosts) {
        console.log(l.createdAt.toISOString(), l.sourceType, sourceMap.get(l.sourceId), 'raw:', l.rawCollected, 'qual:', l.qualified, 'fresh:', l.failedFreshness, 'eng:', l.failedEngagement);
    }

    const totalLogs = await prisma.scrapeLog.count({ where: { sourceId: { in: sourceIds } } });
    const logsZeroRaw = await prisma.scrapeLog.count({ where: { sourceId: { in: sourceIds }, rawCollected: 0 } });
    console.log('\nTotal logs:', totalLogs, '| Zero raw:', logsZeroRaw, '(', ((logsZeroRaw / totalLogs) * 100).toFixed(1), '%)');

    // Posts
    const totalPosts = await prisma.post.count({ where: { workspaceId: 'cmm1im9ft0081s0rghyxckio5' } });
    const posts = await prisma.post.findMany({
        where: { workspaceId: 'cmm1im9ft0081s0rghyxckio5' },
        select: { threadId: true, sourceAccount: true, postedAt: true, hotScore: true, status: true, createdAt: true, sourceType: true },
        orderBy: { createdAt: 'desc' },
        take: 10
    });
    console.log('\n=== POSTS (total:', totalPosts, ') ===');
    for (const p of posts) {
        console.log(p.sourceAccount, p.status, p.sourceType, 'score:', p.hotScore, 'posted:', p.postedAt?.toISOString());
    }

    // HKParties comparison
    const hkWs = await prisma.workspace.findMany({
        where: { name: { contains: 'HKParties' } },
        select: { id: true, name: true, topicFilter: true }
    });
    if (hkWs.length > 0) {
        console.log('\n=== HKParties ===');
        console.log('Topic filter:', hkWs[0].topicFilter || 'NONE');
        const hkSources = await prisma.scraperSource.findMany({
            where: { workspaceId: hkWs[0].id },
            select: { id: true, value: true }
        });
        const hkSourceIds = hkSources.map(s => s.id);
        const hkTotalLogs = await prisma.scrapeLog.count({ where: { sourceId: { in: hkSourceIds } } });
        const hkZeroRaw = await prisma.scrapeLog.count({ where: { sourceId: { in: hkSourceIds }, rawCollected: 0 } });
        console.log('HK Total logs:', hkTotalLogs, '| Zero raw:', hkZeroRaw, '| With posts:', hkTotalLogs - hkZeroRaw);

        const hkWithAt = hkSources.filter(s => s.value.startsWith('@'));
        console.log('HK With @:', hkWithAt.length, '| Without @:', hkSources.length - hkWithAt.length);
    }

    await prisma.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
