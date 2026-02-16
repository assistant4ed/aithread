import { PrismaClient } from "@prisma/client";
import { initialAccounts } from "../lib/accounts";
const prisma = new PrismaClient({
    log: ['info'],
});

async function main() {
    console.log("Start seeding...");

    for (const account of initialAccounts) {
        const existingAccount = await prisma.account.findUnique({
            where: { username: account.username },
        });

        if (!existingAccount) {
            await prisma.account.create({
                data: {
                    username: account.username,
                    profile_pic: account.profile_pic,
                },
            });
            console.log(`Created account: ${account.username}`);
        } else {
            console.log(`Account already exists: ${account.username}`);
        }
    }

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
