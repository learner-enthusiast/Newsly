-- CreateEnum
CREATE TYPE "StockResearchStatus" AS ENUM ('PENDING', 'RUNNING', 'RERUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "StockResearchProvider" AS ENUM ('UPSTOX', 'SERP', 'FIRECRAWL', 'NEWS', 'AI', 'INTERNAL');

-- CreateEnum
CREATE TYPE "StockResearchResourceType" AS ENUM ('MARKET_DATA', 'FUNDAMENTAL', 'NEWS', 'WEB_PAGE', 'OPTIONS', 'HISTORICAL', 'SYNTHESIS', 'OTHER');

-- CreateTable
CREATE TABLE "stock_researches" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "company_name" TEXT,
    "symbol" TEXT,
    "exchange" TEXT,
    "isin" TEXT,
    "instrument_key" TEXT,
    "user_prompt" TEXT,
    "query" TEXT NOT NULL,
    "status" "StockResearchStatus" NOT NULL DEFAULT 'PENDING',
    "run_count" INTEGER NOT NULL DEFAULT 0,
    "determiner_plan" JSONB,
    "report" JSONB,
    "report_markdown" TEXT,
    "error" TEXT,
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_researches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_research_resources" (
    "id" TEXT NOT NULL,
    "stock_research_id" TEXT NOT NULL,
    "provider" "StockResearchProvider" NOT NULL,
    "resource_type" "StockResearchResourceType" NOT NULL,
    "title" TEXT,
    "url" TEXT,
    "external_id" TEXT,
    "content" TEXT,
    "raw_data" JSONB,
    "metadata" JSONB,
    "research_source_id" UUID,
    "content_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stock_research_resources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "stock_researches_user_id_created_at_idx" ON "stock_researches"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "stock_researches_status_created_at_idx" ON "stock_researches"("status", "created_at");

-- CreateIndex
CREATE INDEX "stock_researches_symbol_exchange_idx" ON "stock_researches"("symbol", "exchange");

-- CreateIndex
CREATE INDEX "stock_researches_isin_idx" ON "stock_researches"("isin");

-- CreateIndex
CREATE INDEX "stock_research_resources_stock_research_id_provider_idx" ON "stock_research_resources"("stock_research_id", "provider");

-- CreateIndex
CREATE INDEX "stock_research_resources_stock_research_id_resource_type_idx" ON "stock_research_resources"("stock_research_id", "resource_type");

-- CreateIndex
CREATE INDEX "stock_research_resources_external_id_idx" ON "stock_research_resources"("external_id");

-- CreateIndex
CREATE INDEX "stock_research_resources_content_hash_idx" ON "stock_research_resources"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "stock_research_resources_stock_research_id_provider_content_hash_key" ON "stock_research_resources"("stock_research_id", "provider", "content_hash");

-- AddForeignKey
ALTER TABLE "stock_researches" ADD CONSTRAINT "stock_researches_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_research_resources" ADD CONSTRAINT "stock_research_resources_stock_research_id_fkey" FOREIGN KEY ("stock_research_id") REFERENCES "stock_researches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
