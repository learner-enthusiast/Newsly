import type { EventEvaluationInput } from "@/domain/news/schemas/evaluation";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export function createEvaluationService(deps: NewsServiceDeps) {
  return {
    async recordEvaluation(input: EventEvaluationInput) {
      return deps.repos.evaluation.createEventEvaluation(input);
    },
  };
}

export const evaluationService = createEvaluationService(defaultNewsServiceDeps);
