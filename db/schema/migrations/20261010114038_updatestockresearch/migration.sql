-- AlterTable
ALTER TABLE "stock_researches" ADD COLUMN     "user_prompt" TEXT;

-- RenameIndex
ALTER INDEX "stock_research_resources_stock_research_id_provider_content_has" RENAME TO "stock_research_resources_stock_research_id_provider_content_key";
