-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "externalUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "SynthesizedArticle" ADD COLUMN     "externalUrls" TEXT[] DEFAULT ARRAY[]::TEXT[];
