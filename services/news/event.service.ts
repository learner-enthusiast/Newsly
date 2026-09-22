import type { EventCreateInput } from "@/domain/news/schemas/event";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

/** Legacy helpers — orchestration lives in eventIntelligenceService. */
export function createEventService(deps: NewsServiceDeps) {
  return {
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
  };
}

export const eventService = createEventService(defaultNewsServiceDeps);
