-- AlterTable (user_prompt was intended in 20261010114038, which ran before CREATE in sort order)
ALTER TABLE "stock_researches" ADD COLUMN IF NOT EXISTS "user_prompt" TEXT;

-- AlterTable
ALTER TABLE "stock_researches" ADD COLUMN IF NOT EXISTS "loading_logs" TEXT[] DEFAULT ARRAY[]::TEXT[];
