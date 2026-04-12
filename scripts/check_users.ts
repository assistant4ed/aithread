import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
    console.log("=== Existing Users ===")
    try {
        const users = await (prisma.user as any).findMany({
            select: {
                id: true,
                email: true,
                name: true,
                passwordHash: true
            }
        });

        if (users.length === 0) {
            console.log("No users found.");
        } else {
            users.forEach((u: any) => {
                console.log(`- ${u.name} (${u.email}) [Has password: ${!!u.passwordHash}]`);
            });
        }
    } catch (err: any) {
        console.error("Error fetching users:", err.message);
    } finally {
        await prisma.$disconnect();
    }
}

main()
