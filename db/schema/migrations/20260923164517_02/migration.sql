/*
  Warnings:

  - You are about to drop the column `status` on the `chat_sessions` table. All the data in the column will be lost.
  - The `news_source_id` column on the `chat_sessions` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "chat_sessions" DROP COLUMN "status",
DROP COLUMN "news_source_id",
ADD COLUMN     "news_source_id" UUID[] DEFAULT ARRAY[]::UUID[];
