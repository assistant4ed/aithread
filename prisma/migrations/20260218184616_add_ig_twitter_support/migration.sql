-- AlterTable
ALTER TABLE "SynthesizedArticle" ADD COLUMN     "instagramMediaId" TEXT,
ADD COLUMN     "publishedAtInstagram" TIMESTAMP(3),
ADD COLUMN     "publishedAtTwitter" TIMESTAMP(3),
ADD COLUMN     "publishedUrlInstagram" TEXT,
ADD COLUMN     "publishedUrlTwitter" TEXT,
ADD COLUMN     "tweetId" TEXT;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "instagramAccessToken" TEXT,
ADD COLUMN     "instagramAccountId" TEXT,
ADD COLUMN     "twitterAccessSecret" TEXT,
ADD COLUMN     "twitterAccessToken" TEXT,
ADD COLUMN     "twitterApiKey" TEXT,
ADD COLUMN     "twitterApiSecret" TEXT;
