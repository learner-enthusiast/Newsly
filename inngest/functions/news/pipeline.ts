import { inngestClient } from "@/clients/inngestClient";
import { NEWS_EVENTS } from "@/domain/news/events";
import { discoveryService } from "@/services/news/discovery.service";
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

const { createFunction } = inngestClient;

export const newsDiscoveryRequested = createFunction(
  {
    id: "news-discovery-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.DISCOVERY_REQUESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const result = await step.run("discovery-start", async () =>
      discoveryService.handleDiscoveryRequested(discoveryRunId),
    );

    if (!result.ok) {
      await step.run("discovery-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          result.reason,
          "discovery_requested",
        ),
      );
    }
  },
);

export const newsDocumentsIngestRequested = createFunction(
  {
    id: "news-documents-ingest-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.DOCUMENTS_INGEST_REQUESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const result = await step.run("document-ingest", async () =>
      documentIngestionService.runIngestStage(discoveryRunId),
    );

    if (!result.ok) {
      await step.run("ingest-failed", async () =>
        failDiscoveryFromStep(discoveryRunId, result.reason, "document_ingest"),
      );
    }
  },
);

export const newsDocumentsUnderstandRequested = createFunction(
  {
    id: "news-documents-understand-requested",
    retries: 3,
    triggers: [{ event: NEWS_EVENTS.DOCUMENTS_UNDERSTAND_REQUESTED }],
  },
  async ({ event, step }) => {
    const { discoveryRunId } = parseDiscoveryRunEvent(event.data);

    const result = await step.run("document-understand", async () =>
      documentUnderstandingService.runUnderstandStage(discoveryRunId),
    );

    if (!result.ok) {
      await step.run("understand-failed", async () =>
        failDiscoveryFromStep(
          discoveryRunId,
          result.reason,
          "document_understand",
        ),
      );
    }
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
        await discoveryService.markDiscoveryCompleted(ranking.discoveryRunId);
      }
    });
  },
);

export const newsPipelineFunctions = [
  newsDiscoveryRequested,
  newsDocumentsIngestRequested,
  newsDocumentsUnderstandRequested,
  newsEventsProcessRequested,
  newsEvidenceProcessRequested,
  newsRankingPrimaryRequested,
  newsRankingIndependentRequested,
  newsRankingCoverageRequested,
  newsRankingFinalRequested,
] as const;

inngestClient.register(newsPipelineFunctions);
