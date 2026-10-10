-- CreateEnum
CREATE TYPE "news_story_status" AS ENUM ('PENDING', 'READY', 'FAILED', 'DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "news_story_creator" AS ENUM ('SYSTEM', 'USER');

-- CreateEnum
CREATE TYPE "news_story_provenance" AS ENUM ('SYSTEM', 'USER_RESEARCHED', 'USER_EDITED');

-- AlterTable
ALTER TABLE "news_stories" ADD COLUMN "chat_session_id" UUID,
ADD COLUMN "owner_id" TEXT,
ADD COLUMN "status" "news_story_status" NOT NULL DEFAULT 'PENDING',
ADD COLUMN "creator" "news_story_creator" NOT NULL DEFAULT 'SYSTEM',
ADD COLUMN "provenance" "news_story_provenance" NOT NULL DEFAULT 'SYSTEM';

-- Backfill existing News Pipeline stories
UPDATE "news_stories"
SET
  "status" = 'READY',
  "creator" = 'SYSTEM',
  "provenance" = 'SYSTEM'
WHERE "news_request_id" IS NOT NULL;

-- Allow chat-origin stories without NewsRequest
ALTER TABLE "news_stories" ALTER COLUMN "news_request_id" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "news_stories_chat_session_id_idx" ON "news_stories"("chat_session_id");

-- CreateIndex
CREATE INDEX "news_stories_owner_id_idx" ON "news_stories"("owner_id");

-- CreateIndex
CREATE INDEX "news_stories_status_idx" ON "news_stories"("status");

-- CreateIndex
CREATE INDEX "news_stories_owner_id_status_idx" ON "news_stories"("owner_id", "status");

-- AddForeignKey
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_chat_session_id_fkey" FOREIGN KEY ("chat_session_id") REFERENCES "chat_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_stories" ADD CONSTRAINT "news_stories_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
