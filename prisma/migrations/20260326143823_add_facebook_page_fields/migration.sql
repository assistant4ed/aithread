/*
  Warnings:

  - You are about to drop the column `targetAccounts` on the `Workspace` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[threadId,workspaceId]` on the table `Post` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `updatedAt` to the `SynthesizedArticle` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('ACCOUNT', 'TOPIC');

-- CreateEnum
CREATE TYPE "Platform" AS ENUM ('THREADS', 'INSTAGRAM', 'TWITTER');

-- CreateEnum
CREATE TYPE "ContentMode" AS ENUM ('SCRAPE', 'REFERENCE', 'SEARCH', 'VARIATIONS', 'AUTO_DISCOVER');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('DISCOVERING', 'SYNTHESIZING', 'TRANSLATING', 'REVIEWING', 'COMPLETED', 'ERROR');

-- CreateEnum
CREATE TYPE "PipelineStep" AS ENUM ('SCRAPE', 'SYNTHESIS', 'PUBLISH');

-- CreateEnum
CREATE TYPE "RunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- DropIndex
DROP INDEX "Post_threadId_key";

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "sourceId" TEXT,
ADD COLUMN     "sourceType" "SourceType" NOT NULL DEFAULT 'ACCOUNT';

-- AlterTable
ALTER TABLE "SynthesizedArticle" ADD COLUMN     "facebookPostId" TEXT,
ADD COLUMN     "formatUsed" TEXT,
ADD COLUMN     "lastMetricsUpdate" TIMESTAMP(3),
ADD COLUMN     "likes" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "publishError" TEXT,
ADD COLUMN     "publishRetryCount" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "publishedAtFacebook" TIMESTAMP(3),
ADD COLUMN     "publishedUrlFacebook" TEXT,
ADD COLUMN     "rejectionReason" TEXT,
ADD COLUMN     "replies" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "reposts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "threadsMediaId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Workspace" DROP COLUMN "targetAccounts",
ADD COLUMN     "aiApiKey" TEXT,
ADD COLUMN     "aiModel" TEXT NOT NULL DEFAULT 'llama-3.3-70b-versatile',
ADD COLUMN     "aiProvider" TEXT NOT NULL DEFAULT 'GROQ',
ADD COLUMN     "autoApproveDrafts" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "autoApprovePrompt" TEXT,
ADD COLUMN     "autoDiscoverNiche" TEXT,
ADD COLUMN     "coherenceThreshold" INTEGER NOT NULL DEFAULT 2,
ADD COLUMN     "contentMode" "ContentMode" NOT NULL DEFAULT 'SCRAPE',
ADD COLUMN     "dataCollationHours" INTEGER NOT NULL DEFAULT 6,
ADD COLUMN     "facebookPageId" TEXT,
ADD COLUMN     "facebookPageToken" TEXT,
ADD COLUMN     "newsApiKey" TEXT,
ADD COLUMN     "ownerId" TEXT,
ADD COLUMN     "preferredFormats" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "referenceWorkspaceId" TEXT,
ADD COLUMN     "synthesisPrompt" TEXT NOT NULL DEFAULT 'You are a viral social media editor. Synthesize these clustered social media posts into a high-impact, skimmable curated summary.',
ADD COLUMN     "variationBaseTopics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "variationCount" INTEGER NOT NULL DEFAULT 3;

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("provider","providerAccountId")
);

-- CreateTable
CREATE TABLE "Session" (
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("identifier","token")
);

-- CreateTable
CREATE TABLE "ScraperSource" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "type" "SourceType" NOT NULL,
    "value" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "minLikes" INTEGER DEFAULT 50,
    "minReplies" INTEGER DEFAULT 0,
    "maxAgeHours" INTEGER DEFAULT 24,
    "trustWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScraperSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GenerationRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "status" "GenerationStatus" NOT NULL DEFAULT 'DISCOVERING',
    "currentStep" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "currentTopic" TEXT,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "articlesCreated" INTEGER NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GenerationRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountCache" (
    "id" TEXT NOT NULL,
    "platformId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "followerCount" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccountCache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScrapeLog" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "sourceType" "SourceType" NOT NULL,
    "pagesScraped" INTEGER NOT NULL,
    "rawCollected" INTEGER NOT NULL,
    "failedFreshness" INTEGER NOT NULL,
    "failedEngagement" INTEGER NOT NULL,
    "unknownFollowers" INTEGER NOT NULL,
    "qualified" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ScrapeLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "YoutubeJob" (
    "id" TEXT NOT NULL,
    "videoId" TEXT,
    "videoUrl" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "status" "JobStatus" NOT NULL DEFAULT 'PENDING',
    "pdfUrl" TEXT,
    "oneLiner" TEXT,
    "error" TEXT,
    "requestedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "YoutubeJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PipelineRun" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "step" "PipelineStep" NOT NULL,
    "status" "RunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "PipelineRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "ScraperSource_workspaceId_type_value_key" ON "ScraperSource"("workspaceId", "type", "value");

-- CreateIndex
CREATE INDEX "GenerationRun_workspaceId_status_idx" ON "GenerationRun"("workspaceId", "status");

-- CreateIndex
CREATE INDEX "GenerationRun_workspaceId_startedAt_idx" ON "GenerationRun"("workspaceId", "startedAt");

-- CreateIndex
CREATE INDEX "AccountCache_platformId_idx" ON "AccountCache"("platformId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountCache_platformId_platform_key" ON "AccountCache"("platformId", "platform");

-- CreateIndex
CREATE INDEX "ScrapeLog_sourceId_idx" ON "ScrapeLog"("sourceId");

-- CreateIndex
CREATE INDEX "YoutubeJob_requestedById_idx" ON "YoutubeJob"("requestedById");

-- CreateIndex
CREATE INDEX "PipelineRun_workspaceId_step_idx" ON "PipelineRun"("workspaceId", "step");

-- CreateIndex
CREATE INDEX "PipelineRun_startedAt_idx" ON "PipelineRun"("startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Post_threadId_workspaceId_key" ON "Post"("threadId", "workspaceId");

-- AddForeignKey
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ScraperSource" ADD CONSTRAINT "ScraperSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GenerationRun" ADD CONSTRAINT "GenerationRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "YoutubeJob" ADD CONSTRAINT "YoutubeJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PipelineRun" ADD CONSTRAINT "PipelineRun_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
