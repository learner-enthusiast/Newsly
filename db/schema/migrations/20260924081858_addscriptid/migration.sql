-- AlterTable
ALTER TABLE "chat_messages" ADD COLUMN     "script_id" UUID;

-- AlterTable
ALTER TABLE "scripts" ADD COLUMN     "research_source_ids" UUID[] DEFAULT ARRAY[]::UUID[];
