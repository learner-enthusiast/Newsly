import { NEWS_EVENTS } from "@/domain/news/events";
import type { StageResult } from "@/domain/news/types/pipeline";
import type { EventCreateInput } from "@/domain/news/schemas/event";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export function createEventService(deps: NewsServiceDeps) {
  return {
    /**
     * Idempotent event creation keyed by normalizedTitle + region among ACTIVE events.
     */
    async findOrCreateEvent(input: EventCreateInput) {
      const existing =
        await deps.repos.event.findEventByNormalizedTitleInRegion(
          input.normalizedTitle,
          input.region,
        );
      if (existing) {
        return existing;
      }
      return deps.repos.event.createEvent(input);
    },

    async runEventProcessStage(discoveryRunId: string): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      await deps.events.send(NEWS_EVENTS.EVENTS_PROCESSED, { discoveryRunId });
      await deps.events.send(NEWS_EVENTS.EVIDENCE_PROCESS_REQUESTED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export const eventService = createEventService(defaultNewsServiceDeps);
