-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "is_a_story_request" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN IF NOT EXISTS "news_story_id" UUID;
