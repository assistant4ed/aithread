-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "imagePrompt" TEXT,
ADD COLUMN     "postLookbackHours" INTEGER NOT NULL DEFAULT 24;
