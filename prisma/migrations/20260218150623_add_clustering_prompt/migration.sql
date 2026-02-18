-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "clusteringPrompt" TEXT NOT NULL DEFAULT 'Group these posts into news clusters. Focus on the core event or announcement. Combine posts from different authors if they are about the SAME story. Ignore generic chatter.';
