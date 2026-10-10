-- AlterTable
ALTER TABLE "chat_sessions" ADD COLUMN IF NOT EXISTS "potential_stories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
