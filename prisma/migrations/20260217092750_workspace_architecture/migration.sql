-- CreateEnum
CREATE TYPE "PostStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED', 'ERROR');

-- CreateEnum
CREATE TYPE "CoherenceStatus" AS ENUM ('PENDING', 'COHERENT', 'ISOLATED');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "targetAccounts" TEXT[],
    "translationPrompt" TEXT NOT NULL,
    "hotScoreThreshold" DOUBLE PRECISION NOT NULL DEFAULT 50,
    "threadsAppId" TEXT,
    "threadsToken" TEXT,
    "dailyPostLimit" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Post" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "sourceAccount" TEXT NOT NULL,
    "contentOriginal" TEXT,
    "contentTranslated" TEXT,
    "mediaUrls" JSONB,
    "likes" INTEGER NOT NULL DEFAULT 0,
    "replies" INTEGER NOT NULL DEFAULT 0,
    "reposts" INTEGER NOT NULL DEFAULT 0,
    "hotScore" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sourceUrl" TEXT,
    "status" "PostStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "publishedUrl" TEXT,
    "coherenceStatus" "CoherenceStatus" NOT NULL DEFAULT 'PENDING',
    "topicClusterId" TEXT,
    "lastCoherenceCheck" TIMESTAMP(3),
    "workspaceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),

    CONSTRAINT "Post_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Workspace_name_key" ON "Workspace"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Post_threadId_key" ON "Post"("threadId");

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
