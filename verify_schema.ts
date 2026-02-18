
import { prisma } from "./lib/prisma";

async function main() {
    console.log("Verifying schema fields...");

    // 1. Create a workspace with schedule
    const ws = await prisma.workspace.create({
        data: {
            name: "Test Schedule WS",
            targetAccounts: ["test_user"],
            translationPrompt: "Translate",
            publishTimes: ["09:00", "21:00"],
            reviewWindowHours: 2,
        }
    });
    console.log(`Created workspace: ${ws.id}, publishTimes: ${JSON.stringify(ws.publishTimes)}`);

    // 2. Create an article with media & schedule
    const art = await prisma.synthesizedArticle.create({
        data: {
            topicName: "Test Topic",
            articleContent: "Content",
            workspaceId: ws.id,
            sourcePostIds: [],
            sourceAccounts: [],
            authorCount: 0,
            postCount: 0,
            selectedMediaUrl: "http://example.com/image.jpg",
            selectedMediaType: "IMAGE",
            scheduledPublishAt: new Date(),
        }
    });
    console.log(`Created article: ${art.id}, selectedMediaUrl: ${art.selectedMediaUrl}`);

    // Clean up
    await prisma.synthesizedArticle.delete({ where: { id: art.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
    console.log("Cleanup done. Verification successful.");
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
