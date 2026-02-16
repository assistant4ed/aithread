import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
    log: ['info'],
});

async function main() {
    console.log("Start seeding...");

    // Initial accounts are now managed via Google Sheets.
    // This script can be used for other database seeding tasks if needed.

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
