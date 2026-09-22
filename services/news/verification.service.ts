import type { CreateEventVerificationInput } from "@/repositories/news/verification";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

/** Persistence helpers — orchestration lives in evidenceIntelligenceService. */
export function createVerificationService(deps: NewsServiceDeps) {
  return {
    async recordVerification(input: CreateEventVerificationInput) {
      return deps.repos.verification.createEventVerification(input);
    },
  };
}

export const verificationService = createVerificationService(
  defaultNewsServiceDeps,
);
