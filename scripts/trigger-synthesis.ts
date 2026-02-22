
import { PrismaClient } from "@prisma/client";
import { runSynthesisEngine } from "../lib/synthesis_engine";

const prisma = new PrismaClient();

async function triggerSynthesis() {
    const ws = await prisma.workspace.findUnique({
        where: { id: "cmlwhxgd0000ds0ljg878h6ed" }
    });

    if (!ws) return console.log("Workspace not found");

    console.log("Triggering synthesis engine for Tech News HK...");

    await runSynthesisEngine(ws.id, {
        translationPrompt: ws.translationPrompt,
        clusteringPrompt: ws.clusteringPrompt,
        synthesisLanguage: ws.synthesisLanguage,
        postLookbackHours: ws.postLookbackHours,
        hotScoreThreshold: ws.hotScoreThreshold,
        coherenceThreshold: ws.coherenceThreshold,
        aiProvider: ws.aiProvider,
        aiModel: ws.aiModel,
        aiApiKey: ws.aiApiKey,
    });
}

triggerSynthesis()
    .catch(console.error)
    .finally(() => {
        prisma.$disconnect();
        process.exit(0);
    });
