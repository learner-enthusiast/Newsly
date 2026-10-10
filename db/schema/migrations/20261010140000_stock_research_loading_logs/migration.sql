-- AlterTable
ALTER TABLE "stock_researches" ADD COLUMN IF NOT EXISTS "loading_logs" TEXT[] DEFAULT ARRAY[]::TEXT[];
