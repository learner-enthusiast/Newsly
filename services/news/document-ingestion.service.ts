import { NEWS_EVENTS } from "@/domain/news/events";
import type { StageResult } from "@/domain/news/types/pipeline";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export function createDocumentIngestionService(deps: NewsServiceDeps) {
  return {
    /**
     * Stage stub: will search/scrape/link documents via injected providers.
     * Idempotent document identity uses Document.normalizedUrl (repository layer).
     */
    async runIngestStage(discoveryRunId: string): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      if (!deps.providers.search || !deps.providers.scraper) {
        // Architecture-only: advance pipeline without provider implementations.
      }

      await deps.events.send(NEWS_EVENTS.DOCUMENTS_INGESTED, { discoveryRunId });
      await deps.events.send(NEWS_EVENTS.DOCUMENTS_UNDERSTAND_REQUESTED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export type DocumentIngestionService = ReturnType<
  typeof createDocumentIngestionService
>;

export const documentIngestionService = createDocumentIngestionService(
  defaultNewsServiceDeps,
);
