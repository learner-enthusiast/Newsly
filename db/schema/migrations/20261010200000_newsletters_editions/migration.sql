-- CreateEnum
CREATE TYPE "newsletter_frequency" AS ENUM ('DAILY', 'WEEKDAYS', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "newsletter_delivery_status" AS ENUM ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED');

-- CreateEnum
CREATE TYPE "news_edition_status" AS ENUM ('PENDING', 'BUILDING', 'READY', 'FAILED');

-- AlterTable
ALTER TABLE "news_requests" ADD COLUMN "is_edition" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "news_stories" ADD COLUMN "rank" INTEGER;

-- CreateIndex
CREATE INDEX "news_stories_news_request_id_rank_idx" ON "news_stories"("news_request_id", "rank");

-- CreateTable
CREATE TABLE "newsletters" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "scope" "news_scope" NOT NULL,
    "story_count" INTEGER NOT NULL,
    "categories" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "custom_query" TEXT,
    "language" TEXT,
    "sources" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "frequency" "newsletter_frequency" NOT NULL,
    "send_time_local" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "day_of_week" INTEGER,
    "day_of_month" INTEGER,
    "params_fingerprint" TEXT NOT NULL,
    "next_run_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "newsletters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "news_editions" (
    "id" UUID NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "period_key" TEXT NOT NULL,
    "news_request_id" UUID NOT NULL,
    "status" "news_edition_status" NOT NULL DEFAULT 'PENDING',
    "target_story_count" INTEGER NOT NULL,
    "built_story_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "news_editions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "newsletter_deliveries" (
    "id" UUID NOT NULL,
    "newsletter_id" TEXT NOT NULL,
    "scheduled_for" TIMESTAMPTZ(6) NOT NULL,
    "status" "newsletter_delivery_status" NOT NULL DEFAULT 'PENDING',
    "edition_id" UUID,
    "story_count" INTEGER,
    "sent_at" TIMESTAMPTZ(6),
    "error" TEXT,
    "resend_id" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "newsletter_deliveries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "newsletters_user_id_idx" ON "newsletters"("user_id");

-- CreateIndex
CREATE INDEX "newsletters_is_active_next_run_at_idx" ON "newsletters"("is_active", "next_run_at");

-- CreateIndex
CREATE INDEX "newsletters_params_fingerprint_idx" ON "newsletters"("params_fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "news_editions_news_request_id_key" ON "news_editions"("news_request_id");

-- CreateIndex
CREATE UNIQUE INDEX "news_editions_fingerprint_period_key_key" ON "news_editions"("fingerprint", "period_key");

-- CreateIndex
CREATE INDEX "news_editions_status_idx" ON "news_editions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "newsletter_deliveries_newsletter_id_scheduled_for_key" ON "newsletter_deliveries"("newsletter_id", "scheduled_for");

-- CreateIndex
CREATE INDEX "newsletter_deliveries_edition_id_idx" ON "newsletter_deliveries"("edition_id");

-- CreateIndex
CREATE INDEX "newsletter_deliveries_status_idx" ON "newsletter_deliveries"("status");

-- AddForeignKey
ALTER TABLE "newsletters" ADD CONSTRAINT "newsletters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "news_editions" ADD CONSTRAINT "news_editions_news_request_id_fkey" FOREIGN KEY ("news_request_id") REFERENCES "news_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_newsletter_id_fkey" FOREIGN KEY ("newsletter_id") REFERENCES "newsletters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "newsletter_deliveries" ADD CONSTRAINT "newsletter_deliveries_edition_id_fkey" FOREIGN KEY ("edition_id") REFERENCES "news_editions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
