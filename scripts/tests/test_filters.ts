
import { processPost } from "../../lib/processor";
import { PrismaClient } from "@prisma/client";

// Mocking getSettings is hard in this environment without a library, 
// so we will trust the integration test or just run it and see logs.
// However, we can use a "dry run" or simple manual verification by calling processPost
// with data that should fail.

const prisma = new PrismaClient();

async function main() {
    console.log("Testing Filters...");

    // Mock payload
    const lowLikesPost = {
        threadId: "test_low_likes",
        content: "This is a valid length post but has low likes.",
        mediaUrls: [],
        likes: 10, // < 300
        replies: 0,
        reposts: 0,
        postUrl: "http://test.com/1"
    };

    const shortPost = {
        threadId: "test_short",
        content: "Hi", // < 5 words
        mediaUrls: [],
        likes: 1000,
        replies: 10,
        reposts: 10,
        postUrl: "http://test.com/2"
    };

    const goodPost = {
        threadId: "test_good",
        content: "This is a good post about AI and it should pass the filters if the topic is relevant.",
        mediaUrls: [],
        likes: 5000,
        replies: 100,
        reposts: 50,
        postUrl: "http://test.com/3"
    };

    // Create Dummy Account
    const account = await prisma.account.upsert({
        where: { username: "filter_test_user" },
        update: {},
        create: { username: "filter_test_user" }
    });
    const accountId = account.id;

    // We expect logs from processPost saying "Skipping..."

    console.log("--- Test 1: Low Likes ---");
    await processPost(lowLikesPost, accountId);

    console.log("--- Test 2: Short Content ---");
    await processPost(shortPost, accountId);

    console.log("--- Test 3: Good Post (Might fail topic check if strict) ---");
    await processPost(goodPost, accountId);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
