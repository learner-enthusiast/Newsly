import { createHash } from "node:crypto";
import { inngestClient } from "@/clients/inngestClient";
import { NEWS_EVENTS } from "@/domain/news/events";
import { discoveryService } from "@/services/news/discovery.service";
import {
  discoveryEngineService,
  type ExecuteSearchTaskResult,
} from "@/services/news/discovery/discovery-engine.service";
import { documentIngestionService } from "@/services/news/document-ingestion.service";
import { documentUnderstandingService } from "@/services/news/document-understanding.service";
import { eventIntelligenceService } from "@/services/news/event-intelligence.service";
import type { ProcessDocumentEventsResult } from "@/services/news/event-intelligence.service";
import { evidenceIntelligenceService } from "@/services/news/evidence-intelligence.service";
import type { ProcessEventEvidenceResult } from "@/services/news/evidence-intelligence.service";
import { rankingIntelligenceService } from "@/services/news/ranking-intelligence.service";
import type { RegionRankingResult } from "@/services/news/ranking-intelligence.service";
import { finalRankingService } from "@/services/news/final-ranking.service";
import {
  appendPipelineObservability,
  runWithPipelineObservability,
} from "@/services/news/pipeline-observability";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import {
  failDiscoveryFromStep,
  parseDiscoveryRunEvent,
} from "@/inngest/functions/news/helpers";
import type { IngestBatchResult } from "@/services/news/document-ingestion.service";
import type { UnderstandDocumentResult } from "@/services/news/document-understanding.service";

const { createFunction } = inngestClient;

export const newsDiscoveryRequested = createFunction(
  {
    id: "news-discovery-requested",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.DISCOVERY_REQUESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const plan = await step.run("discovery-plan", async () =>
      discoveryEngineService.buildPlan(discoveryRunId),
    );

    if (!plan.ok) {
      await step.run("discovery-plan-failed", async () =>
        failDiscoveryFromStep(discoveryRunId, plan.reason, "discovery_plan"),
      );
      return;
    }

    const running = await step.run("discovery-mark-running", async () =>
      discoveryEngineService.markRunning(discoveryRunId),
    );

    if (!running.ok) {
      await step.run("discovery-running-failed", async () =>
        failDiscoveryFromStep(discoveryRunId, running.reason, "discovery_start"),
      );
      return;
    }

    const taskResults: ExecuteSearchTaskResult[] = [];
    for (const task of plan.tasks) {
      const result = await step.run(
        `discovery-search-${task.executionKey}`,
        async () => discoveryEngineService.executePlannedSearch(task),
      );
      taskResults.push(result);
    }

    const finalized = await step.run("discovery-finalize", async () =>
      discoveryEngineService.finalizeDiscovery(
        discoveryRunId,
        taskResults,
        plan.tasks.length,
      ),
    );

    if (!finalized.ok) {
      await step.run("discovery-finalize-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          finalized.reason,
          "discovery_finalize",
        ),
      );
    }
  },
);

export const newsDiscoverySourcesCompleted = createFunction(
  {
    id: "news-discovery-sources-completed",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.DISCOVERY_SOURCES_COMPLETED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const plan = await step.run("document-ingest-plan", async () =>
      documentIngestionService.buildIngestPlan(discoveryRunId),
    );

    if (!plan.ok) {
      await step.run("document-ingest-plan-failed", async () =>
        failDiscoveryFromStep(discoveryRunId, plan.reason, "document_ingest"),
      );
      return;
    }

    await step.run("document-ingest-mark-running", async () =>
      documentIngestionService.markIngestRunning(discoveryRunId),
    );

    const batches = documentIngestionService.chunkGroups(plan.groups);
    const batchResults: IngestBatchResult[] = [];

    for (const batch of batches) {
      const batchStepKey = createHash("sha256")
        .update(batch.map((group) => group.normalizedUrl).sort().join("|"))
        .digest("hex")
        .slice(0, 24);

      const results = await step.run(
        `document-ingest-${batchStepKey}`,
        async () => documentIngestionService.ingestBatch(batch),
      );
      batchResults.push(...results);
    }

    const finalized = await step.run("document-ingest-finalize", async () =>
      documentIngestionService.finalizeIngest(discoveryRunId, batchResults),
    );

    if (!finalized.ok) {
      await step.run("document-ingest-finalize-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          finalized.reason,
          "document_ingest",
        ),
      );
    }
  },
);

export const newsDocumentsIngested = createFunction(
  {
    id: "news-documents-ingested",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.DOCUMENTS_INGESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const plan = await step.run("document-understand-plan", async () =>
      documentUnderstandingService.buildUnderstandPlan(discoveryRunId),
    );

    if (!plan.ok) {
      await step.run("document-understand-plan-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          plan.reason,
          "document_understand",
        ),
      );
      return;
    }

    await step.run("document-understand-mark-running", async () =>
      documentUnderstandingService.markUnderstandRunning(discoveryRunId),
    );

    const batches = documentUnderstandingService.chunkDocumentIds(
      plan.documentIds,
    );
    const understandResults: UnderstandDocumentResult[] = [];

    for (const batch of batches) {
      const batchStepKey = createHash("sha256")
        .update(batch.slice().sort().join("|"))
        .digest("hex")
        .slice(0, 24);

      const results = await step.run(
        `document-understand-${batchStepKey}`,
        async () => documentUnderstandingService.understandBatch(batch),
      );
      understandResults.push(...results);
    }

    const finalized = await step.run("document-understand-finalize", async () =>
      documentUnderstandingService.finalizeUnderstanding(
        discoveryRunId,
        understandResults,
      ),
    );

    if (!finalized.ok) {
      await step.run("document-understand-finalize-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          finalized.reason,
          "document_understand",
        ),
      );
    }
  },
);

export const newsDocumentsUnderstood = createFunction(
  {
    id: "news-documents-understood",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.DOCUMENTS_UNDERSTOOD }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const plan = await step.run("event-process-plan", async () =>
      eventIntelligenceService.buildEventProcessPlan(discoveryRunId),
    );

    if (!plan.ok) {
      await step.run("event-process-plan-failed", async () =>
        failDiscoveryFromStep(discoveryRunId, plan.reason, "event_process"),
      );
      return;
    }

    await step.run("event-process-mark-running", async () =>
      eventIntelligenceService.markEventProcessRunning(discoveryRunId),
    );

    const docResults: ProcessDocumentEventsResult[] = [];
    for (const documentId of plan.documentIds) {
      const result = await step.run(`event-process-doc-${documentId}`, async () =>
        eventIntelligenceService.processDocumentEvents(
          discoveryRunId,
          documentId,
        ),
      );
      docResults.push(result);
    }

    const narrativeStats = await step.run("event-process-narratives", async () =>
      eventIntelligenceService.detectNarratives(discoveryRunId),
    );

    const finalized = await step.run("event-process-finalize", async () =>
      eventIntelligenceService.finalizeEventProcess(
        discoveryRunId,
        docResults,
        narrativeStats,
      ),
    );

    if (!finalized.ok) {
      await step.run("event-process-finalize-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          finalized.reason,
          "event_process",
        ),
      );
    }
  },
);

export const newsEventsProcessed = createFunction(
  {
    id: "news-events-processed",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.EVENTS_PROCESSED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const plan = await step.run("evidence-process-plan", async () =>
      evidenceIntelligenceService.buildEvidenceProcessPlan(discoveryRunId),
    );

    if (!plan.ok) {
      await step.run("evidence-process-plan-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          plan.reason,
          "evidence_process",
        ),
      );
      return;
    }

    await step.run("evidence-process-mark-running", async () =>
      evidenceIntelligenceService.markEvidenceProcessRunning(discoveryRunId),
    );

    const evidenceResults: ProcessEventEvidenceResult[] = [];
    for (const eventId of plan.eventIds) {
      const result = await step.run(`evidence-process-event-${eventId}`, async () =>
        evidenceIntelligenceService.processEventEvidence(
          discoveryRunId,
          eventId,
        ),
      );
      evidenceResults.push(result);
    }

    const finalized = await step.run("evidence-process-finalize", async () =>
      evidenceIntelligenceService.finalizeEvidenceProcess(
        discoveryRunId,
        evidenceResults,
      ),
    );

    if (!finalized.ok) {
      await step.run("evidence-process-finalize-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          finalized.reason,
          "evidence_process",
        ),
      );
    }
  },
);

export const newsEvidenceProcessed = createFunction(
  {
    id: "news-evidence-processed",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.EVIDENCE_PROCESSED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const plan = await step.run("ranking-challenge-plan", async () =>
      rankingIntelligenceService.buildRankingChallengePlan(discoveryRunId),
    );

    if (!plan.ok) {
      await step.run("ranking-challenge-plan-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          plan.reason,
          "ranking_primary",
        ),
      );
      return;
    }

    await step.run("ranking-challenge-mark-running", async () =>
      rankingIntelligenceService.markRankingChallengeRunning(discoveryRunId),
    );

    const regionResults: RegionRankingResult[] = [];

    for (const region of plan.regions) {
      const primary = await step.run(`ranking-primary-${region}`, async () =>
        rankingIntelligenceService.runPrimaryRankingForRegion(
          discoveryRunId,
          region,
        ),
      );

      if (primary.status === "failed") {
        await step.run(`ranking-primary-failed-${region}`, async () =>
          failDiscoveryFromStep(
            discoveryRunId,
            primary.error ?? "ranking_primary_failed",
            "ranking_primary",
          ),
        );
        continue;
      }

      const independent = await step.run(
        `ranking-independent-${primary.rankingRunId}`,
        async () =>
          rankingIntelligenceService.runIndependentRankingForRegion(
            primary.rankingRunId,
          ),
      );

      if (independent.status === "failed") {
        await step.run(`ranking-independent-failed-${region}`, async () =>
          failDiscoveryFromStep(
            discoveryRunId,
            independent.error ?? "ranking_independent_failed",
            "ranking_independent",
          ),
        );
        continue;
      }

      await step.run(
        `ranking-disagreement-${primary.rankingRunId}`,
        async () =>
          rankingIntelligenceService.compareRankingDisagreements(
            primary.rankingRunId,
          ),
      );

      const coverage = await step.run(
        `ranking-coverage-${primary.rankingRunId}`,
        async () =>
          rankingIntelligenceService.runCoverageGapForRegion(
            primary.rankingRunId,
          ),
      );

      regionResults.push(coverage);
    }

    const finalized = await step.run("ranking-challenge-finalize", async () =>
      rankingIntelligenceService.finalizeRankingChallenge(
        discoveryRunId,
        regionResults,
      ),
    );

    if (!finalized.ok) {
      await step.run("ranking-challenge-finalize-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          finalized.reason,
          "ranking_coverage",
        ),
      );
    }
  },
);

export const newsRankingCoverageCompleted = createFunction(
  {
    id: "news-ranking-coverage-completed",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.RANKING_COVERAGE_COMPLETED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const finalResult = await step.run("ranking-final", async () =>
      runWithPipelineObservability(defaultNewsServiceDeps, {
        discoveryRunId,
        stage: "ranking_final",
        run: () =>
          finalRankingService.runFinalRankingForDiscoveryRun(discoveryRunId),
        countKeys: (result) => ({
          regions: result.ok && result.regions ? result.regions.length : 0,
          topStories:
            result.ok && result.regions
              ? result.regions.reduce((sum, row) => sum + row.topCount, 0)
              : 0,
        }),
      }),
    );

    if (!finalResult.ok) {
      await step.run("ranking-final-failed", async () => {
        await appendPipelineObservability(defaultNewsServiceDeps, {
          discoveryRunId,
          stage: "ranking_final",
          status: "failed",
          error: finalResult.reason,
        });
        await failDiscoveryFromStep(
          discoveryRunId,
          finalResult.reason,
          "ranking_final",
        );
      });
      return;
    }

    await step.run("discovery-complete", async () => {
      await runWithPipelineObservability(defaultNewsServiceDeps, {
        discoveryRunId,
        stage: "discovery_complete",
        run: async () => {
          await discoveryService.markDiscoveryRunCompleted(discoveryRunId);
          return { completed: true };
        },
      });
    });
  },
);

export const newsDiscoveryPipelineCompleted = createFunction(
  {
    id: "news-discovery-pipeline-completed",
    retries: 1,
    triggers: [{ event: NEWS_EVENTS.DISCOVERY_COMPLETED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);
    await step.run("pipeline-completed-observability", async () => {
      await appendPipelineObservability(defaultNewsServiceDeps, {
        discoveryRunId,
        stage: "pipeline_complete",
        status: "completed",
      });
    });
  },
);

export const newsPipelineFunctions = [
  newsDiscoveryRequested,
  newsDiscoverySourcesCompleted,
  newsDocumentsIngested,
  newsDocumentsUnderstood,
  newsEventsProcessed,
  newsEvidenceProcessed,
  newsRankingCoverageCompleted,
  newsDiscoveryPipelineCompleted,
] as const;

inngestClient.register(newsPipelineFunctions);
