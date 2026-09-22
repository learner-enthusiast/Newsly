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
import { eventService } from "@/services/news/event.service";
import { verificationService } from "@/services/news/verification.service";
import { rankingService } from "@/services/news/ranking.service";
import {
  failDiscoveryFromStep,
  parseDiscoveryRunEvent,
  parseRankingRunEvent,
} from "@/inngest/functions/news/helpers";
import { getRankingRunById } from "@/repositories/news/ranking";
import { pipelineEventPublisher } from "@/infrastructure/inngest/pipeline-event-publisher";
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

export const newsDiscoveryCompleted = createFunction(
  {
    id: "news-discovery-completed",
    retries: 2,
    triggers: [{ event: NEWS_EVENTS.DISCOVERY_COMPLETED }],
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
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.DOCUMENTS_UNDERSTOOD }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    await step.run("enqueue-event-process", async () => {
      await pipelineEventPublisher.send(NEWS_EVENTS.EVENTS_PROCESS_REQUESTED, {
        discoveryRunId,
      });
    });
  },
);

export const newsEventsProcessRequested = createFunction(
  {
    id: "news-events-process-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.EVENTS_PROCESS_REQUESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const result = await step.run("event-process", async () =>
      eventService.runEventProcessStage(discoveryRunId),
    );

    if (!result.ok) {
      await step.run("events-failed", async () =>
        failDiscoveryFromStep(discoveryRunId, result.reason, "event_process"),
      );
    }
  },
);

export const newsEvidenceProcessRequested = createFunction(
  {
    id: "news-evidence-process-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.EVIDENCE_PROCESS_REQUESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const result = await step.run("evidence-process", async () =>
      verificationService.runEvidenceProcessStage(discoveryRunId),
    );

    if (!result.ok) {
      await step.run("evidence-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          result.reason,
          "evidence_process",
        ),
      );
    }
  },
);

export const newsRankingPrimaryRequested = createFunction(
  {
    id: "news-ranking-primary-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.RANKING_PRIMARY_REQUESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const result = await step.run("ranking-primary", async () =>
      rankingService.runPrimaryRankingStage(discoveryRunId),
    );

    if (!result.ok) {
      await step.run("ranking-primary-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          result.reason,
          "ranking_primary",
        ),
      );
    }
  },
);

export const newsRankingIndependentRequested = createFunction(
  {
    id: "news-ranking-independent-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.RANKING_INDEPENDENT_REQUESTED }],
  },
  async ({ event, step }) => {
    const { rankingRunId } = parseRankingRunEvent(event.data);

    const result = await step.run("ranking-independent", async () =>
      rankingService.runIndependentRankingStage(rankingRunId),
    );

    if (!result.ok) {
      await step.run("ranking-independent-failed", async () => {
        const ranking = await getRankingRunById(rankingRunId);
        if (ranking) {
          await failDiscoveryFromStep(
            ranking.discoveryRunId,
            result.reason,
            "ranking_independent",
          );
        }
      });
    }
  },
);

export const newsRankingCoverageRequested = createFunction(
  {
    id: "news-ranking-coverage-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.RANKING_COVERAGE_REQUESTED }],
  },
  async ({ event, step }) => {
    const { rankingRunId } = parseRankingRunEvent(event.data);

    const result = await step.run("ranking-coverage", async () =>
      rankingService.runCoverageRankingStage(rankingRunId),
    );

    if (!result.ok) {
      await step.run("ranking-coverage-failed", async () => {
        const ranking = await getRankingRunById(rankingRunId);
        if (ranking) {
          await failDiscoveryFromStep(
            ranking.discoveryRunId,
            result.reason,
            "ranking_coverage",
          );
        }
      });
    }
  },
);

export const newsRankingFinalRequested = createFunction(
  {
    id: "news-ranking-final-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.RANKING_FINAL_REQUESTED }],
  },
  async ({ event, step }) => {
    const { rankingRunId } = parseRankingRunEvent(event.data);

    const result = await step.run("ranking-final", async () =>
      rankingService.runFinalRankingStage(rankingRunId),
    );

    if (!result.ok) {
      await step.run("ranking-final-failed", async () => {
        const ranking = await getRankingRunById(rankingRunId);
        if (ranking) {
          await failDiscoveryFromStep(
            ranking.discoveryRunId,
            result.reason,
            "ranking_final",
          );
        }
      });
      return;
    }

    await step.run("discovery-complete", async () => {
      const ranking = await getRankingRunById(rankingRunId);
      if (ranking) {
        await discoveryService.markDiscoveryRunCompleted(ranking.discoveryRunId);
      }
    });
  },
);

export const newsPipelineFunctions = [
  newsDiscoveryRequested,
  newsDiscoveryCompleted,
  newsDocumentsIngested,
  newsDocumentsUnderstood,
  newsEventsProcessRequested,
  newsEvidenceProcessRequested,
  newsRankingPrimaryRequested,
  newsRankingIndependentRequested,
  newsRankingCoverageRequested,
  newsRankingFinalRequested,
] as const;

inngestClient.register(newsPipelineFunctions);
