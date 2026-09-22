import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

/** Phase 2 deep research — persistence helpers only for now. */
export function createResearchService(deps: NewsServiceDeps) {
  return {
    async startProject(input: {
      userId: string;
      eventId: string;
      narrativeId?: string;
      title?: string;
    }) {
      return deps.repos.research.createResearchProject(input);
    },

    async attachDocument(researchProjectId: string, documentId: string) {
      return deps.repos.research.linkResearchSource(
        researchProjectId,
        documentId,
      );
    },

    async attachClaim(researchProjectId: string, claimId: string) {
      return deps.repos.research.linkResearchClaim(researchProjectId, claimId);
    },
  };
}

export const researchService = createResearchService(defaultNewsServiceDeps);
