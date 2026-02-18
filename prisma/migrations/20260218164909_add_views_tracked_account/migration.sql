-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "TrackedAccount" (
    "username" TEXT NOT NULL,
    "followerCount" INTEGER NOT NULL DEFAULT 0,
    "lastFetchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TrackedAccount_pkey" PRIMARY KEY ("username")
);
