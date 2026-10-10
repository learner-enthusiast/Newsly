-- AlterTable
ALTER TABLE "news_stories" ADD COLUMN IF NOT EXISTS "loading_logs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "loading_logs" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
