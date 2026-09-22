import type { CreateNarrativeInput } from "@/repositories/news/narrative";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export function createNarrativeService(deps: NewsServiceDeps) {
  return {
    async createNarrative(input: CreateNarrativeInput) {
      return deps.repos.narrative.createNarrative(input);
    },

    async linkEventToNarrative(
      input: Parameters<
        typeof deps.repos.narrative.linkEventNarrative
      >[0],
    ) {
      return deps.repos.narrative.linkEventNarrative(input);
    },
  };
}

export const narrativeService = createNarrativeService(defaultNewsServiceDeps);
