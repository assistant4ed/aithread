-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "lastPublishedAt" TIMESTAMP(3),
ADD COLUMN     "lastScrapedAt" TIMESTAMP(3),
ADD COLUMN     "lastSynthesizedAt" TIMESTAMP(3);
