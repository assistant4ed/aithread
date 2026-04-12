import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

async function main() {
    const email = "admin@example.com"
    const password = "password123"
    const name = "Admin User"

    console.log("=== Initializing Admin User ===")

    try {
        const passwordHash = await bcrypt.hash(password, 10)

        const user = await (prisma.user as any).upsert({
            where: { email },
            update: {
                passwordHash,
                name,
            },
            create: {
                name,
                email,
                passwordHash,
            }
        })

        console.log(`\n✅ Admin user ready: ${user.email}`)
        console.log(`Password: ${password}`)
        console.log("You can now log in with these credentials.")
    } catch (err: any) {
        console.error("\n❌ Error creating user:", err.message)
    } finally {
        await prisma.$disconnect()
    }
}

main()
