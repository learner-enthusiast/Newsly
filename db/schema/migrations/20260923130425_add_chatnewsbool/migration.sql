-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN     "is_from_news_story" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "news_stories" ADD COLUMN     "news_source_ids" UUID[] DEFAULT ARRAY[]::UUID[];
