-- AlterTable
ALTER TABLE "ScraperSource" ALTER COLUMN "minLikes" SET DEFAULT 50,
ALTER COLUMN "minReplies" SET DEFAULT 0,
ALTER COLUMN "maxAgeHours" SET DEFAULT 24;

-- CreateIndex
CREATE UNIQUE INDEX "ScraperSource_workspaceId_type_value_key" ON "ScraperSource"("workspaceId", "type", "value");
