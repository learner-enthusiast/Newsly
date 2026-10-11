-- CreateEnum
CREATE TYPE "ResearchAssetType" AS ENUM ('STOCK', 'ETF', 'MUTUAL_FUND');

-- AlterTable
ALTER TABLE "stock_researches" ADD COLUMN "asset_type" "ResearchAssetType" NOT NULL DEFAULT 'STOCK';

-- CreateIndex
CREATE INDEX "stock_researches_user_id_asset_type_created_at_idx" ON "stock_researches"("user_id", "asset_type", "created_at");
