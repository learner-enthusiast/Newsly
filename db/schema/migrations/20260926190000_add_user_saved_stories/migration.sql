-- AlterTable
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "saved_stories" UUID[] DEFAULT ARRAY[]::UUID[];
