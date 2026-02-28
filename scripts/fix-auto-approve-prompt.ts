/**
 * One-time DB fix: Update "Tech News HK" workspace auto-approve prompt.
 *
 * The previous prompt was too restrictive, causing 100% rejection rate.
 * This script sets a lenient prompt that only rejects clear spam.
 *
 * Usage:
 *   npx tsx scripts/fix-auto-approve-prompt.ts
 */

import "dotenv/config";
import { prisma } from "../lib/prisma";

async function main() {
    const workspace = await prisma.workspace.findFirst({
        where: { name: "Tech News HK" },
        select: { id: true, name: true, autoApproveDrafts: true, autoApprovePrompt: true },
    });

    if (!workspace) {
        console.log("Workspace 'Tech News HK' not found. Skipping.");
        return;
    }

    console.log(`Found workspace: ${workspace.name} (${workspace.id})`);
    console.log(`  autoApproveDrafts: ${workspace.autoApproveDrafts}`);
    console.log(`  current prompt: "${workspace.autoApprovePrompt || "(none)"}"`);

    const newPrompt = "Approve if the article covers technology, AI, startups, or digital trends. Reject only clear spam or completely unrelated content.";

    await prisma.workspace.update({
        where: { id: workspace.id },
        data: { autoApprovePrompt: newPrompt },
    });

    console.log(`\nUpdated autoApprovePrompt to:\n  "${newPrompt}"`);
    console.log("Done.");
}

main()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
