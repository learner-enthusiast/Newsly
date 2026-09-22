-- pgvector must exist before any `vector` columns (Prisma emits bare `vector` for Unsupported fields).
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "plan_status" AS ENUM ('draft', 'processing', 'ready', 'failed', 'archived');

-- CreateEnum
CREATE TYPE "plan_visibility" AS ENUM ('private', 'public');

-- CreateEnum
CREATE TYPE "request_region" AS ENUM ('INDIA', 'WORLD', 'BOTH');

-- CreateEnum
CREATE TYPE "region" AS ENUM ('INDIA', 'WORLD');

-- CreateEnum
CREATE TYPE "discovery_period" AS ENUM ('DAY', 'WEEK', 'MONTH');

-- CreateEnum
CREATE TYPE "discovery_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "search_provider" AS ENUM ('SERPAPI', 'NSE', 'BSE');

-- CreateEnum
CREATE TYPE "search_type" AS ENUM ('GOOGLE_NEWS', 'GOOGLE_FINANCE', 'GOOGLE_SEARCH', 'CORPORATE_FILINGS');

-- CreateEnum
CREATE TYPE "search_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "scrape_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "source_type" AS ENUM ('PRIMARY', 'MAJOR_MEDIA', 'SECONDARY_MEDIA', 'BLOG', 'SOCIAL', 'OTHER');

-- CreateEnum
CREATE TYPE "entity_type" AS ENUM ('COMPANY', 'PERSON', 'ORGANIZATION', 'GOVERNMENT', 'REGULATOR', 'COUNTRY', 'CITY', 'SECTOR', 'INDUSTRY', 'FINANCIAL_INSTRUMENT', 'PRODUCT', 'INDEX', 'OTHER');

-- CreateEnum
CREATE TYPE "event_type" AS ENUM ('CORPORATE', 'FINANCIAL', 'ECONOMIC', 'MARKET', 'REGULATORY', 'POLITICAL', 'LEGAL', 'GEOPOLITICAL', 'TECHNOLOGY', 'COMMODITY', 'MACRO', 'OTHER');

-- CreateEnum
CREATE TYPE "event_status" AS ENUM ('ACTIVE', 'SUPERSEDED', 'RESOLVED', 'CANCELLED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "event_claim_relationship" AS ENUM ('SUPPORTS', 'DESCRIBES', 'QUALIFIES', 'CONTRADICTS', 'UPDATES');

-- CreateEnum
CREATE TYPE "event_document_relationship" AS ENUM ('REPORTS', 'SUPPORTS', 'PRIMARY_SOURCE', 'ANALYSIS', 'FOLLOW_UP');

-- CreateEnum
CREATE TYPE "contradiction_severity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "contradiction_resolution_status" AS ENUM ('UNRESOLVED', 'UNDER_REVIEW', 'RESOLVED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "narrative_status" AS ENUM ('ACTIVE', 'DORMANT', 'RESOLVED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "narrative_relationship" AS ENUM ('UPDATE', 'FOLLOW_UP', 'CAUSE', 'EFFECT', 'ESCALATION', 'REVERSAL', 'RELATED');

-- CreateEnum
CREATE TYPE "verification_status" AS ENUM ('UNVERIFIED', 'PARTIALLY_VERIFIED', 'VERIFIED', 'CONTESTED', 'INCONCLUSIVE');

-- CreateEnum
CREATE TYPE "consensus_level" AS ENUM ('HIGH', 'MODERATE', 'MIXED', 'LOW', 'CONTESTED');

-- CreateEnum
CREATE TYPE "ranking_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "evaluator_type" AS ENUM ('PRIMARY_RANKER', 'INDEPENDENT_RANKER', 'CHALLENGER', 'COVERAGE_REVIEWER');

-- CreateEnum
CREATE TYPE "coverage_gap_status" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "clerkId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "username" TEXT,
    "imageUrl" TEXT,
    "hasImage" BOOLEAN NOT NULL DEFAULT false,
    "primaryEmailAddressId" TEXT,
    "lastSignInAt" TIMESTAMP(3),
    "lastActiveAt" TIMESTAMP(3),
    "banned" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false,
    "locale" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "userId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "plan_status" NOT NULL,
    "visibility" "plan_visibility" NOT NULL,
    "requestData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_preferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultRegion" "request_region",
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_preferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discovery_runs" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "region" "request_region" NOT NULL,
    "period" "discovery_period" NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "discovery_status" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "discovery_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "search_executions" (
    "id" TEXT NOT NULL,
    "discoveryRunId" TEXT NOT NULL,
    "provider" "search_provider" NOT NULL,
    "searchType" "search_type" NOT NULL,
    "region" "region" NOT NULL,
    "status" "search_status" NOT NULL DEFAULT 'PENDING',
    "query" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "search_executions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "raw_search_results" (
    "id" TEXT NOT NULL,
    "searchExecutionId" TEXT NOT NULL,
    "documentId" TEXT,
    "url" TEXT NOT NULL,
    "title" TEXT,
    "snippet" TEXT,
    "position" INTEGER,
    "publishedAt" TIMESTAMP(3),
    "providerPayload" JSONB,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raw_search_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sources" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "sourceType" "source_type" NOT NULL,
    "region" "region",
    "country" TEXT,
    "credibilityTier" INTEGER NOT NULL DEFAULT 3,
    "isPrimarySource" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sources_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "canonicalUrl" TEXT,
    "normalizedUrl" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "author" TEXT,
    "publishedAt" TIMESTAMP(3),
    "content" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "scrapeStatus" "scrape_status" NOT NULL DEFAULT 'PENDING',
    "scrapedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" TEXT NOT NULL,
    "entityType" "entity_type" NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_entities" (
    "documentId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_entities_pkey" PRIMARY KEY ("documentId","entityId")
);

-- CreateTable
CREATE TABLE "event_entities" (
    "eventId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_entities_pkey" PRIMARY KEY ("eventId","entityId")
);

-- CreateTable
CREATE TABLE "claim_entities" (
    "claimId" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "role" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "claim_entities_pkey" PRIMARY KEY ("claimId","entityId")
);

-- CreateTable
CREATE TABLE "claims" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "claimText" TEXT NOT NULL,
    "normalizedClaim" TEXT NOT NULL,
    "confidence" DECIMAL(5,4),
    "embedding" vector,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "normalizedTitle" TEXT NOT NULL,
    "description" TEXT,
    "eventType" "event_type" NOT NULL,
    "region" "region" NOT NULL,
    "eventDate" TIMESTAMP(3),
    "status" "event_status" NOT NULL DEFAULT 'ACTIVE',
    "embedding" vector,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_claims" (
    "eventId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "relationship" "event_claim_relationship" NOT NULL,
    "evidenceStrength" DECIMAL(5,4),
    "isPrimaryEvidence" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_claims_pkey" PRIMARY KEY ("eventId","claimId","relationship")
);

-- CreateTable
CREATE TABLE "event_documents" (
    "eventId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "relationship" "event_document_relationship" NOT NULL,
    "evidenceStrength" DECIMAL(5,4),
    "isPrimaryEvidence" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_documents_pkey" PRIMARY KEY ("eventId","documentId","relationship")
);

-- CreateTable
CREATE TABLE "contradictions" (
    "id" TEXT NOT NULL,
    "claimAId" TEXT NOT NULL,
    "claimBId" TEXT NOT NULL,
    "contradictionType" TEXT NOT NULL,
    "severity" "contradiction_severity" NOT NULL,
    "explanation" TEXT,
    "resolutionStatus" "contradiction_resolution_status" NOT NULL DEFAULT 'UNRESOLVED',
    "resolutionNotes" TEXT,
    "confidence" DECIMAL(5,4),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contradictions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "narratives" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "region" "region" NOT NULL,
    "startDate" TIMESTAMP(3),
    "latestEventDate" TIMESTAMP(3),
    "status" "narrative_status" NOT NULL DEFAULT 'ACTIVE',
    "embedding" vector,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "narratives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_narratives" (
    "eventId" TEXT NOT NULL,
    "narrativeId" TEXT NOT NULL,
    "relationship" "narrative_relationship" NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "event_narratives_pkey" PRIMARY KEY ("eventId","narrativeId","relationship")
);

-- CreateTable
CREATE TABLE "event_verifications" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "evidenceConfidence" DECIMAL(5,4),
    "primarySourceAvailable" BOOLEAN NOT NULL DEFAULT false,
    "independentSourceCount" INTEGER NOT NULL DEFAULT 0,
    "supportingSourceCount" INTEGER NOT NULL DEFAULT 0,
    "contradictingSourceCount" INTEGER NOT NULL DEFAULT 0,
    "consensusLevel" "consensus_level",
    "verificationStatus" "verification_status" NOT NULL DEFAULT 'UNVERIFIED',
    "reasoning" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_evaluations" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "financialSignificance" DECIMAL(5,4),
    "marketRelevance" DECIMAL(5,4),
    "economicImpact" DECIMAL(5,4),
    "breadth" DECIMAL(5,4),
    "magnitude" DECIMAL(5,4),
    "investorRelevance" DECIMAL(5,4),
    "novelty" DECIMAL(5,4),
    "narrativeSignificance" DECIMAL(5,4),
    "contentPotential" DECIMAL(5,4),
    "humanInterest" DECIMAL(5,4),
    "explainability" DECIMAL(5,4),
    "evidenceConfidence" DECIMAL(5,4),
    "consensusLevel" "consensus_level",
    "contradictionSeverity" "contradiction_severity",
    "previousState" JSONB,
    "newInformation" BOOLEAN,
    "whatChanged" TEXT,
    "whyItMatters" TEXT,
    "reasoning" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_runs" (
    "id" TEXT NOT NULL,
    "discoveryRunId" TEXT NOT NULL,
    "region" "region" NOT NULL,
    "period" "discovery_period" NOT NULL,
    "rankingVersion" TEXT NOT NULL,
    "status" "ranking_status" NOT NULL DEFAULT 'PENDING',
    "methodology" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ranking_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_rankings" (
    "id" TEXT NOT NULL,
    "rankingRunId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "finalScore" DECIMAL(8,4),
    "importanceScore" DECIMAL(8,4),
    "noveltyScore" DECIMAL(8,4),
    "evidenceScore" DECIMAL(8,4),
    "narrativeScore" DECIMAL(8,4),
    "contentScore" DECIMAL(8,4),
    "reasoning" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_evaluations" (
    "id" TEXT NOT NULL,
    "rankingRunId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "evaluatorType" "evaluator_type" NOT NULL,
    "finalScore" DECIMAL(8,4),
    "importanceScore" DECIMAL(8,4),
    "noveltyScore" DECIMAL(8,4),
    "evidenceScore" DECIMAL(8,4),
    "narrativeScore" DECIMAL(8,4),
    "contentScore" DECIMAL(8,4),
    "reasoning" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_evaluations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ranking_disagreements" (
    "id" TEXT NOT NULL,
    "rankingRunId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "evaluatorTypeA" "evaluator_type" NOT NULL,
    "evaluatorTypeB" "evaluator_type" NOT NULL,
    "dimension" TEXT NOT NULL,
    "severity" "contradiction_severity" NOT NULL DEFAULT 'MEDIUM',
    "explanation" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ranking_disagreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_gap_runs" (
    "id" TEXT NOT NULL,
    "discoveryRunId" TEXT,
    "rankingRunId" TEXT NOT NULL,
    "region" "region" NOT NULL,
    "status" "coverage_gap_status" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coverage_gap_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coverage_gap_candidates" (
    "id" TEXT NOT NULL,
    "coverageGapRunId" TEXT NOT NULL,
    "rawSearchResultId" TEXT,
    "documentId" TEXT,
    "eventId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "coverage_gap_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "top_story_selections" (
    "id" TEXT NOT NULL,
    "rankingRunId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "region" "region" NOT NULL,
    "rank" INTEGER NOT NULL,
    "selectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "top_story_selections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "event_outcomes" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "observationDate" DATE NOT NULL,
    "marketMovement" TEXT,
    "narrativeContinued" BOOLEAN,
    "subsequentSignificance" DECIMAL(5,4),
    "outcomeClassification" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "event_outcomes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_projects" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "narrativeId" TEXT,
    "title" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "research_projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "research_project_sources" (
    "researchProjectId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_project_sources_pkey" PRIMARY KEY ("researchProjectId","documentId")
);

-- CreateTable
CREATE TABLE "research_project_claims" (
    "researchProjectId" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "research_project_claims_pkey" PRIMARY KEY ("researchProjectId","claimId")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_clerkId_key" ON "users"("clerkId");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "plans_userId_idx" ON "plans"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "plans_userId_slug_key" ON "plans"("userId", "slug");

-- CreateIndex
CREATE UNIQUE INDEX "user_preferences_userId_key" ON "user_preferences"("userId");

-- CreateIndex
CREATE INDEX "discovery_runs_userId_idx" ON "discovery_runs"("userId");

-- CreateIndex
CREATE INDEX "discovery_runs_status_idx" ON "discovery_runs"("status");

-- CreateIndex
CREATE INDEX "discovery_runs_region_idx" ON "discovery_runs"("region");

-- CreateIndex
CREATE INDEX "discovery_runs_createdAt_idx" ON "discovery_runs"("createdAt");

-- CreateIndex
CREATE INDEX "search_executions_discoveryRunId_idx" ON "search_executions"("discoveryRunId");

-- CreateIndex
CREATE INDEX "search_executions_region_idx" ON "search_executions"("region");

-- CreateIndex
CREATE INDEX "search_executions_status_idx" ON "search_executions"("status");

-- CreateIndex
CREATE INDEX "raw_search_results_searchExecutionId_idx" ON "raw_search_results"("searchExecutionId");

-- CreateIndex
CREATE INDEX "raw_search_results_documentId_idx" ON "raw_search_results"("documentId");

-- CreateIndex
CREATE INDEX "sources_domain_idx" ON "sources"("domain");

-- CreateIndex
CREATE INDEX "sources_region_idx" ON "sources"("region");

-- CreateIndex
CREATE INDEX "sources_sourceType_idx" ON "sources"("sourceType");

-- CreateIndex
CREATE UNIQUE INDEX "documents_normalizedUrl_key" ON "documents"("normalizedUrl");

-- CreateIndex
CREATE INDEX "documents_sourceId_idx" ON "documents"("sourceId");

-- CreateIndex
CREATE INDEX "documents_contentHash_idx" ON "documents"("contentHash");

-- CreateIndex
CREATE INDEX "documents_publishedAt_idx" ON "documents"("publishedAt");

-- CreateIndex
CREATE INDEX "documents_scrapeStatus_idx" ON "documents"("scrapeStatus");

-- CreateIndex
CREATE INDEX "entities_normalizedName_idx" ON "entities"("normalizedName");

-- CreateIndex
CREATE INDEX "entities_entityType_idx" ON "entities"("entityType");

-- CreateIndex
CREATE INDEX "document_entities_entityId_idx" ON "document_entities"("entityId");

-- CreateIndex
CREATE INDEX "event_entities_entityId_idx" ON "event_entities"("entityId");

-- CreateIndex
CREATE INDEX "claim_entities_entityId_idx" ON "claim_entities"("entityId");

-- CreateIndex
CREATE INDEX "claims_documentId_idx" ON "claims"("documentId");

-- CreateIndex
CREATE INDEX "claims_normalizedClaim_idx" ON "claims"("normalizedClaim");

-- CreateIndex
CREATE INDEX "events_normalizedTitle_idx" ON "events"("normalizedTitle");

-- CreateIndex
CREATE INDEX "events_eventDate_idx" ON "events"("eventDate");

-- CreateIndex
CREATE INDEX "events_region_idx" ON "events"("region");

-- CreateIndex
CREATE INDEX "events_status_idx" ON "events"("status");

-- CreateIndex
CREATE INDEX "events_eventType_idx" ON "events"("eventType");

-- CreateIndex
CREATE INDEX "event_claims_claimId_idx" ON "event_claims"("claimId");

-- CreateIndex
CREATE INDEX "event_documents_documentId_idx" ON "event_documents"("documentId");

-- CreateIndex
CREATE INDEX "contradictions_claimAId_idx" ON "contradictions"("claimAId");

-- CreateIndex
CREATE INDEX "contradictions_claimBId_idx" ON "contradictions"("claimBId");

-- CreateIndex
CREATE INDEX "contradictions_resolutionStatus_idx" ON "contradictions"("resolutionStatus");

-- CreateIndex
CREATE INDEX "narratives_region_idx" ON "narratives"("region");

-- CreateIndex
CREATE INDEX "narratives_status_idx" ON "narratives"("status");

-- CreateIndex
CREATE INDEX "narratives_latestEventDate_idx" ON "narratives"("latestEventDate");

-- CreateIndex
CREATE INDEX "event_narratives_narrativeId_idx" ON "event_narratives"("narrativeId");

-- CreateIndex
CREATE INDEX "event_verifications_eventId_idx" ON "event_verifications"("eventId");

-- CreateIndex
CREATE INDEX "event_verifications_verificationStatus_idx" ON "event_verifications"("verificationStatus");

-- CreateIndex
CREATE INDEX "event_evaluations_eventId_idx" ON "event_evaluations"("eventId");

-- CreateIndex
CREATE INDEX "event_evaluations_createdAt_idx" ON "event_evaluations"("createdAt");

-- CreateIndex
CREATE INDEX "ranking_runs_discoveryRunId_idx" ON "ranking_runs"("discoveryRunId");

-- CreateIndex
CREATE INDEX "ranking_runs_region_idx" ON "ranking_runs"("region");

-- CreateIndex
CREATE INDEX "ranking_runs_status_idx" ON "ranking_runs"("status");

-- CreateIndex
CREATE INDEX "event_rankings_rankingRunId_rank_idx" ON "event_rankings"("rankingRunId", "rank");

-- CreateIndex
CREATE INDEX "event_rankings_eventId_idx" ON "event_rankings"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "event_rankings_rankingRunId_eventId_key" ON "event_rankings"("rankingRunId", "eventId");

-- CreateIndex
CREATE INDEX "ranking_evaluations_rankingRunId_idx" ON "ranking_evaluations"("rankingRunId");

-- CreateIndex
CREATE INDEX "ranking_evaluations_eventId_idx" ON "ranking_evaluations"("eventId");

-- CreateIndex
CREATE INDEX "ranking_evaluations_evaluatorType_idx" ON "ranking_evaluations"("evaluatorType");

-- CreateIndex
CREATE INDEX "ranking_disagreements_rankingRunId_idx" ON "ranking_disagreements"("rankingRunId");

-- CreateIndex
CREATE INDEX "ranking_disagreements_eventId_idx" ON "ranking_disagreements"("eventId");

-- CreateIndex
CREATE INDEX "coverage_gap_runs_rankingRunId_idx" ON "coverage_gap_runs"("rankingRunId");

-- CreateIndex
CREATE INDEX "coverage_gap_runs_discoveryRunId_idx" ON "coverage_gap_runs"("discoveryRunId");

-- CreateIndex
CREATE INDEX "coverage_gap_runs_region_idx" ON "coverage_gap_runs"("region");

-- CreateIndex
CREATE INDEX "coverage_gap_runs_status_idx" ON "coverage_gap_runs"("status");

-- CreateIndex
CREATE INDEX "coverage_gap_candidates_coverageGapRunId_idx" ON "coverage_gap_candidates"("coverageGapRunId");

-- CreateIndex
CREATE INDEX "coverage_gap_candidates_rawSearchResultId_idx" ON "coverage_gap_candidates"("rawSearchResultId");

-- CreateIndex
CREATE INDEX "coverage_gap_candidates_documentId_idx" ON "coverage_gap_candidates"("documentId");

-- CreateIndex
CREATE INDEX "coverage_gap_candidates_eventId_idx" ON "coverage_gap_candidates"("eventId");

-- CreateIndex
CREATE INDEX "top_story_selections_eventId_idx" ON "top_story_selections"("eventId");

-- CreateIndex
CREATE UNIQUE INDEX "top_story_selections_rankingRunId_eventId_key" ON "top_story_selections"("rankingRunId", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "top_story_selections_rankingRunId_region_rank_key" ON "top_story_selections"("rankingRunId", "region", "rank");

-- CreateIndex
CREATE INDEX "event_outcomes_eventId_idx" ON "event_outcomes"("eventId");

-- CreateIndex
CREATE INDEX "event_outcomes_observationDate_idx" ON "event_outcomes"("observationDate");

-- CreateIndex
CREATE INDEX "research_projects_userId_idx" ON "research_projects"("userId");

-- CreateIndex
CREATE INDEX "research_projects_eventId_idx" ON "research_projects"("eventId");

-- CreateIndex
CREATE INDEX "research_projects_narrativeId_idx" ON "research_projects"("narrativeId");

-- CreateIndex
CREATE INDEX "research_project_sources_documentId_idx" ON "research_project_sources"("documentId");

-- CreateIndex
CREATE INDEX "research_project_claims_claimId_idx" ON "research_project_claims"("claimId");

-- AddForeignKey
ALTER TABLE "plans" ADD CONSTRAINT "plans_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discovery_runs" ADD CONSTRAINT "discovery_runs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "search_executions" ADD CONSTRAINT "search_executions_discoveryRunId_fkey" FOREIGN KEY ("discoveryRunId") REFERENCES "discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_search_results" ADD CONSTRAINT "raw_search_results_searchExecutionId_fkey" FOREIGN KEY ("searchExecutionId") REFERENCES "search_executions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raw_search_results" ADD CONSTRAINT "raw_search_results_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "sources"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_entities" ADD CONSTRAINT "document_entities_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_entities" ADD CONSTRAINT "document_entities_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_entities" ADD CONSTRAINT "event_entities_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_entities" ADD CONSTRAINT "event_entities_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_entities" ADD CONSTRAINT "claim_entities_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claim_entities" ADD CONSTRAINT "claim_entities_entityId_fkey" FOREIGN KEY ("entityId") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "claims" ADD CONSTRAINT "claims_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_claims" ADD CONSTRAINT "event_claims_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_claims" ADD CONSTRAINT "event_claims_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_documents" ADD CONSTRAINT "event_documents_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contradictions" ADD CONSTRAINT "contradictions_claimAId_fkey" FOREIGN KEY ("claimAId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contradictions" ADD CONSTRAINT "contradictions_claimBId_fkey" FOREIGN KEY ("claimBId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_narratives" ADD CONSTRAINT "event_narratives_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_narratives" ADD CONSTRAINT "event_narratives_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "narratives"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_verifications" ADD CONSTRAINT "event_verifications_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_evaluations" ADD CONSTRAINT "event_evaluations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_runs" ADD CONSTRAINT "ranking_runs_discoveryRunId_fkey" FOREIGN KEY ("discoveryRunId") REFERENCES "discovery_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rankings" ADD CONSTRAINT "event_rankings_rankingRunId_fkey" FOREIGN KEY ("rankingRunId") REFERENCES "ranking_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_rankings" ADD CONSTRAINT "event_rankings_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_evaluations" ADD CONSTRAINT "ranking_evaluations_rankingRunId_fkey" FOREIGN KEY ("rankingRunId") REFERENCES "ranking_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_evaluations" ADD CONSTRAINT "ranking_evaluations_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_disagreements" ADD CONSTRAINT "ranking_disagreements_rankingRunId_fkey" FOREIGN KEY ("rankingRunId") REFERENCES "ranking_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ranking_disagreements" ADD CONSTRAINT "ranking_disagreements_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_gap_runs" ADD CONSTRAINT "coverage_gap_runs_discoveryRunId_fkey" FOREIGN KEY ("discoveryRunId") REFERENCES "discovery_runs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_gap_runs" ADD CONSTRAINT "coverage_gap_runs_rankingRunId_fkey" FOREIGN KEY ("rankingRunId") REFERENCES "ranking_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_gap_candidates" ADD CONSTRAINT "coverage_gap_candidates_coverageGapRunId_fkey" FOREIGN KEY ("coverageGapRunId") REFERENCES "coverage_gap_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_gap_candidates" ADD CONSTRAINT "coverage_gap_candidates_rawSearchResultId_fkey" FOREIGN KEY ("rawSearchResultId") REFERENCES "raw_search_results"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_gap_candidates" ADD CONSTRAINT "coverage_gap_candidates_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coverage_gap_candidates" ADD CONSTRAINT "coverage_gap_candidates_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_story_selections" ADD CONSTRAINT "top_story_selections_rankingRunId_fkey" FOREIGN KEY ("rankingRunId") REFERENCES "ranking_runs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "top_story_selections" ADD CONSTRAINT "top_story_selections_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "event_outcomes" ADD CONSTRAINT "event_outcomes_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "events"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_projects" ADD CONSTRAINT "research_projects_narrativeId_fkey" FOREIGN KEY ("narrativeId") REFERENCES "narratives"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_sources" ADD CONSTRAINT "research_project_sources_researchProjectId_fkey" FOREIGN KEY ("researchProjectId") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_sources" ADD CONSTRAINT "research_project_sources_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_claims" ADD CONSTRAINT "research_project_claims_researchProjectId_fkey" FOREIGN KEY ("researchProjectId") REFERENCES "research_projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "research_project_claims" ADD CONSTRAINT "research_project_claims_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;
