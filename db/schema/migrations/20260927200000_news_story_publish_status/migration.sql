-- CreateEnum
CREATE TYPE "publish_status" AS ENUM ('draft', 'published');

-- AlterTable: add new columns
ALTER TABLE "news_stories"
ADD COLUMN IF NOT EXISTS "is_user_created" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "publish_status" "publish_status",
ADD COLUMN IF NOT EXISTS "generation_error" TEXT;

-- Backfill system stories as published (preserve existing public behavior)
UPDATE "news_stories"
SET
  "is_user_created" = false,
  "publish_status" = 'published'
WHERE "news_request_id" IS NOT NULL;

-- Chat-origin / owner stories created via chat pipeline
UPDATE "news_stories"
SET
  "is_user_created" = true,
  "publish_status" = CASE
    WHEN "status" IN ('PUBLISHED') THEN 'published'::"publish_status"
    ELSE 'draft'::"publish_status"
  END
WHERE "news_request_id" IS NULL
  AND "owner_id" IS NOT NULL;

-- Any remaining rows (safety)
UPDATE "news_stories"
SET
  "is_user_created" = COALESCE("is_user_created", false),
  "publish_status" = COALESCE("publish_status", 'published'::"publish_status")
WHERE "publish_status" IS NULL;

ALTER TABLE "news_stories"
ALTER COLUMN "publish_status" SET NOT NULL,
ALTER COLUMN "publish_status" SET DEFAULT 'published';

-- Drop legacy lifecycle columns
DROP INDEX IF EXISTS "news_stories_status_idx";
DROP INDEX IF EXISTS "news_stories_owner_id_status_idx";

ALTER TABLE "news_stories"
DROP COLUMN IF EXISTS "status",
DROP COLUMN IF EXISTS "creator",
DROP COLUMN IF EXISTS "provenance";

DROP TYPE IF EXISTS "news_story_status";
DROP TYPE IF EXISTS "news_story_creator";
DROP TYPE IF EXISTS "news_story_provenance";

CREATE INDEX "news_stories_is_user_created_publish_status_idx"
ON "news_stories"("is_user_created", "publish_status");

CREATE INDEX "news_stories_owner_id_publish_status_idx"
ON "news_stories"("owner_id", "publish_status");
