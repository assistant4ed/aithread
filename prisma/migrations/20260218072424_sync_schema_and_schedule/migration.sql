-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "postedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "maxPostAgeHours" INTEGER NOT NULL DEFAULT 48,
ADD COLUMN     "publishTimes" TEXT[] DEFAULT ARRAY['12:00', '18:00', '22:00']::TEXT[],
ADD COLUMN     "reviewWindowHours" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "synthesisLanguage" TEXT NOT NULL DEFAULT 'Traditional Chinese (HK/TW)',
ADD COLUMN     "topicFilter" TEXT;

-- CreateTable
CREATE TABLE "SynthesizedArticle" (
    "id" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "articleContent" TEXT NOT NULL,
    "articleOriginal" TEXT,
    "sourcePostIds" TEXT[],
    "sourceAccounts" TEXT[],
    "authorCount" INTEGER NOT NULL,
    "postCount" INTEGER NOT NULL,
    "selectedMediaUrl" TEXT,
    "selectedMediaType" TEXT,
    "scheduledPublishAt" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,
    "status" "PostStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "publishedUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "SynthesizedArticle_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "SynthesizedArticle" ADD CONSTRAINT "SynthesizedArticle_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
