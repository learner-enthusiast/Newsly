-- AlterEnum
ALTER TYPE "news_scope" ADD VALUE 'both';

-- AlterTable
ALTER TABLE "news_requests" ADD COLUMN "story_count" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "news_requests" ADD COLUMN "categories" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "news_requests" ADD COLUMN "custom_query" TEXT;
ALTER TABLE "news_requests" ADD COLUMN "language" TEXT;
ALTER TABLE "news_requests" ADD COLUMN "sources" TEXT[] DEFAULT ARRAY[]::TEXT[];
