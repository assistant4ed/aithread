import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({ log: ['info'] });

const DEFAULT_TRANSLATION_PROMPT = `You are a professional translator. Translate the following Threads post to Traditional Chinese (Hong Kong style, Cantonese nuances if applicable).

RULES:
1. Output ONLY the translated text. Do NOT add "Here is the translation" or any conversational filler.
2. Do NOT translate the username, date code (e.g., 2d, 10/07/24), or engagement numbers (e.g., 604, 197) if they appear at the start or end. Try to identify the main body of the post and translate that.
3. Maintain the tone and brevity.`;

async function main() {
    console.log("Start seeding...");

    // Create a default workspace from existing env configuration
    const workspace = await prisma.workspace.upsert({
        where: { name: "Default Workspace" },
        update: {},
        create: {
            name: "Default Workspace",
            isActive: true,
            translationPrompt: DEFAULT_TRANSLATION_PROMPT,
            hotScoreThreshold: 50,
            threadsAppId: process.env.THREADS_APP_ID || null,
            threadsToken: process.env.THREADS_ACCESS_TOKEN || null,
            dailyPostLimit: 3,
        },
    });

    console.log(`Seeded workspace: ${workspace.name} (${workspace.id})`);
    console.log("Seeding finished.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
