export {
  createDiscoveryService,
  discoveryService,
  type DiscoveryService,
} from "@/services/news/discovery.service";
export {
  createDiscoveryEngineService,
  discoveryEngineService,
} from "@/services/news/discovery/discovery-engine.service";
export {
  createDocumentIngestionService,
  documentIngestionService,
} from "@/services/news/document-ingestion.service";
export {
  createDocumentUnderstandingService,
  documentUnderstandingService,
} from "@/services/news/document-understanding.service";
export { createEventService, eventService } from "@/services/news/event.service";
export {
  createNarrativeService,
  narrativeService,
} from "@/services/news/narrative.service";
export {
  createVerificationService,
  verificationService,
} from "@/services/news/verification.service";
export {
  createEvidenceIntelligenceService,
  evidenceIntelligenceService,
} from "@/services/news/evidence-intelligence.service";
export {
  createEvaluationService,
  evaluationService,
} from "@/services/news/evaluation.service";
export {
  createFinalRankingService,
  finalRankingService,
} from "@/services/news/final-ranking.service";
export {
  createDiscoveryResultsService,
  discoveryResultsService,
} from "@/services/news/discovery-results.service";
export {
  createRankingIntelligenceService,
  rankingIntelligenceService,
} from "@/services/news/ranking-intelligence.service";
export {
  createCoverageGapService,
  coverageGapService,
} from "@/services/news/coverage-gap.service";
export {
  createResearchService,
  researchService,
} from "@/services/news/research.service";
export {
  defaultNewsServiceDeps,
  type NewsServiceDeps,
} from "@/services/news/deps";
