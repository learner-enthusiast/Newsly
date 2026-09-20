-- AlterTable
ALTER TABLE "plans" ADD COLUMN     "festivalId" UUID;

-- CreateIndex
CREATE INDEX "plans_festivalId_idx" ON "plans"("festivalId");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_festivalId_fkey" FOREIGN KEY ("festivalId") REFERENCES "festival_knowledge"("id") ON DELETE SET NULL ON UPDATE CASCADE;
