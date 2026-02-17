
import { runTrendAnalysis } from "../../lib/trend_engine";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("Resetting coherence data for testing...");

    // Clean up or seed data if needed
    // For now, we assume strict adherence to manual testing
    // But we can verify if the function RUNS without error

    try {
        console.log("Running Trend Analysis...");
        await runTrendAnalysis();
        console.log("Trend Analysis completed successfully.");
    } catch (e) {
        console.error("Trend Analysis crashed:", e);
    }
}

main()
    .catch((e) => console.error(e))
    .finally(() => prisma.$disconnect());
