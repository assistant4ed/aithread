-- AlterTable
ALTER TABLE "SynthesizedArticle" ADD COLUMN     "mediaUrls" JSONB[] DEFAULT ARRAY[]::JSONB[];
