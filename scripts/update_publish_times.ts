import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    const result = await prisma.workspace.update({
        where: { id: "cm8zmvcdt0004p7n8kdwnwdxd" },
        data: {
            publishTimes: ["00:01", "08:03", "11:00", "14:06", "15:30", "17:00", "19:32", "20:00", "20:15", "20:20", "20:27", "20:40", "22:15"]
        }
    });
    console.log("✅ Updated workspace:", result.name);
    console.log("📅 Publish times:", result.publishTimes);
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
