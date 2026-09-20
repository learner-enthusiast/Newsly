-- CreateTable
CREATE TABLE "festival_knowledge" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "historicalFacts" JSONB,
    "culturalContext" JSONB,
    "planningProfile" JSONB,
    "cities" JSONB,
    "searchTaxonomy" JSONB,
    "rituals" JSONB,
    "terminology" JSONB,
    "dateInformation" JSONB,
    "transportProfile" JSONB,
    "crowdProfile" JSONB,
    "foodProfile" JSONB,
    "researchRules" JSONB,
    "sources" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "festival_knowledge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "festival_knowledge_slug_key" ON "festival_knowledge"("slug");
