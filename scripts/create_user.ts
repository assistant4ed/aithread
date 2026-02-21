import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import readline from "readline"

const prisma = new PrismaClient()

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

async function main() {
    console.log("=== Create New User ===")

    rl.question("Name: ", (name) => {
        rl.question("Email: ", (email) => {
            rl.question("Password: ", async (password) => {
                try {
                    const passwordHash = await bcrypt.hash(password, 10)

                    const user = await (prisma.user as any).create({
                        data: {
                            name,
                            email,
                            passwordHash,
                        }
                    })

                    console.log(`\n✅ User created successfully: ${user.email}`)
                    console.log("You can now log in with these credentials.")
                } catch (err: any) {
                    console.error("\n❌ Error creating user:", err.message)
                } finally {
                    await prisma.$disconnect()
                    rl.close()
                }
            })
        })
    })
}

main()
