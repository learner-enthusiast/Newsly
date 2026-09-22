import { NEWS_EVENTS } from "@/domain/news/events";
import type { StageResult } from "@/domain/news/types/pipeline";
import type { CreateEventVerificationInput } from "@/repositories/news/verification";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export function createVerificationService(deps: NewsServiceDeps) {
  return {
    async recordVerification(input: CreateEventVerificationInput) {
      return deps.repos.verification.createEventVerification(input);
    },

    async runEvidenceProcessStage(discoveryRunId: string): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      await deps.events.send(NEWS_EVENTS.EVIDENCE_PROCESSED, {
        discoveryRunId,
      });
      await deps.events.send(NEWS_EVENTS.RANKING_PRIMARY_REQUESTED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export const verificationService = createVerificationService(
  defaultNewsServiceDeps,
);
