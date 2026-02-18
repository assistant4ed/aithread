-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "instagramExpiresAt" INTEGER,
ADD COLUMN     "instagramRefreshToken" TEXT,
ADD COLUMN     "twitterExpiresAt" INTEGER,
ADD COLUMN     "twitterRefreshToken" TEXT;
