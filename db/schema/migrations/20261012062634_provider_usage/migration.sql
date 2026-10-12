-- CreateEnum
CREATE TYPE "usage_provider" AS ENUM ('serpapi', 'firecrawl');

-- CreateEnum
CREATE TYPE "usage_reason" AS ENUM ('charged', 'cached', 'error', 'no_document', 'archive', 'timeout_assumed');

-- CreateTable
CREATE TABLE "provider_usage" (
    "id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "provider" "usage_provider" NOT NULL,
    "operation" TEXT NOT NULL,
    "user_id" TEXT,
    "run_id" TEXT,
    "source" TEXT NOT NULL,
    "workflow" TEXT,
    "edition_id" TEXT,
    "ip_hash" TEXT,
    "environment" TEXT NOT NULL,
    "credits" INTEGER NOT NULL,
    "billable" BOOLEAN NOT NULL,
    "reason" "usage_reason" NOT NULL,
    "http_status" INTEGER,
    "duration_ms" INTEGER NOT NULL,
    "detail" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "provider_usage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "provider_usage_user_id_created_at_idx" ON "provider_usage"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "provider_usage_provider_created_at_idx" ON "provider_usage"("provider", "created_at");

-- CreateIndex
CREATE INDEX "provider_usage_run_id_idx" ON "provider_usage"("run_id");

-- CreateIndex
CREATE INDEX "provider_usage_edition_id_idx" ON "provider_usage"("edition_id");

-- AddForeignKey
ALTER TABLE "provider_usage" ADD CONSTRAINT "provider_usage_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
