import { NEWS_EVENTS } from "@/domain/news/events";
import type { StageResult } from "@/domain/news/types/pipeline";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export function createDocumentUnderstandingService(deps: NewsServiceDeps) {
  return {
    /** Extract claims/entities from ingested documents (LLM provider injected later). */
    async runUnderstandStage(discoveryRunId: string): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      await deps.events.send(NEWS_EVENTS.DOCUMENTS_UNDERSTOOD, {
        discoveryRunId,
      });
      await deps.events.send(NEWS_EVENTS.EVENTS_PROCESS_REQUESTED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export const documentUnderstandingService = createDocumentUnderstandingService(
  defaultNewsServiceDeps,
);
