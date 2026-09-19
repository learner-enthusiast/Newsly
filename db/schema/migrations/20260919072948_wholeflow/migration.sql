-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('draft', 'processing', 'ready', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "plan_visibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "plan_message_role" AS ENUM ('user', 'assistant');

-- CreateEnum
CREATE TYPE "place_type" AS ENUM ('pandal', 'temple', 'food', 'restaurant', 'cafe', 'parking', 'restroom', 'atm', 'pharmacy', 'event', 'other');

-- CreateEnum
CREATE TYPE "plan_item_type" AS ENUM ('pandal', 'food', 'restaurant', 'cafe', 'parking', 'restroom', 'event', 'custom');

-- CreateEnum
CREATE TYPE "research_run_status" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "research_run_type" AS ENUM ('initial_generation', 'regeneration', 'refresh');

-- CreateEnum
CREATE TYPE "research_source_type" AS ENUM ('google_search', 'google_maps', 'official', 'news', 'website', 'blog', 'other');

-- CreateEnum
CREATE TYPE "place_source_relationship_type" AS ENUM ('location', 'rating', 'festival', 'timing', 'description');

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "festivalName" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "status" "plan_status" NOT NULL,
    "visibility" "plan_visibility" NOT NULL,
    "requestData" JSONB,
    "weather" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_messages" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "role" "plan_message_role" NOT NULL,
    "content" TEXT NOT NULL,
    "messageData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_days" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "dayNumber" INTEGER NOT NULL,
    "date" DATE,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startTime" TIME(3),
    "endTime" TIME(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_days_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "places" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "place_type" NOT NULL,
    "address" TEXT,
    "city" TEXT,
    "area" TEXT,
    "latitude" DECIMAL(65,30),
    "longitude" DECIMAL(65,30),
    "googlePlaceId" TEXT,
    "serpDataId" TEXT,
    "rating" DECIMAL(65,30),
    "reviewCount" INTEGER,
    "description" TEXT,
    "thumbnailUrl" TEXT,
    "hours" JSONB,
    "metadata" JSONB,
    "lastVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "places_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_items" (
    "id" UUID NOT NULL,
    "dayId" UUID NOT NULL,
    "placeId" UUID,
    "type" "plan_item_type" NOT NULL,
    "position" INTEGER NOT NULL,
    "titleOverride" TEXT,
    "descriptionOverride" TEXT,
    "startTime" TIME(3),
    "durationMinutes" INTEGER,
    "notes" TEXT,
    "snapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_runs" (
    "id" UUID NOT NULL,
    "planId" UUID NOT NULL,
    "status" "research_run_status" NOT NULL,
    "runType" "research_run_type" NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "error" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_sources" (
    "id" UUID NOT NULL,
    "researchRunId" UUID NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "sourceType" "research_source_type" NOT NULL,
    "searchQuery" TEXT,
    "snippet" TEXT,
    "content" TEXT,
    "contentHash" TEXT,
    "retrievedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "place_sources" (
    "placeId" UUID NOT NULL,
    "sourceId" UUID NOT NULL,
    "relationshipType" "place_source_relationship_type" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "place_sources_pkey" PRIMARY KEY ("placeId","sourceId")
);

-- CreateIndex
CREATE UNIQUE INDEX "plans_userId_slug_key" ON "plans"("userId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "plan_days_planId_dayNumber_key" ON "plan_days"("planId", "dayNumber");

-- CreateIndex
CREATE UNIQUE INDEX "places_googlePlaceId_key" ON "places"("googlePlaceId");

-- CreateIndex
CREATE INDEX "places_serpDataId_idx" ON "places"("serpDataId");

-- CreateIndex
CREATE UNIQUE INDEX "plan_items_dayId_position_key" ON "plan_items"("dayId", "position");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_messages" ADD CONSTRAINT "plan_messages_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_days" ADD CONSTRAINT "plan_days_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_dayId_fkey" FOREIGN KEY ("dayId") REFERENCES "plan_days"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_runs" ADD CONSTRAINT "research_runs_planId_fkey" FOREIGN KEY ("planId") REFERENCES "plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_sources" ADD CONSTRAINT "research_sources_researchRunId_fkey" FOREIGN KEY ("researchRunId") REFERENCES "research_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_sources" ADD CONSTRAINT "place_sources_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "places"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "place_sources" ADD CONSTRAINT "place_sources_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "research_sources"("id") ON DELETE CASCADE ON UPDATE CASCADE;
