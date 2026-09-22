import { prisma } from "@/db";
import { toNullableJson } from "@/repositories/json";
import type { EventEvaluationInput } from "@/domain/news/schemas/evaluation";

/** Always inserts a new row — historical evaluations are preserved. */
export async function createEventEvaluation(input: EventEvaluationInput) {
  return prisma.eventEvaluation.create({
    data: {
      eventId: input.eventId,
      financialSignificance: input.financialSignificance,
      marketRelevance: input.marketRelevance,
      economicImpact: input.economicImpact,
      breadth: input.breadth,
      magnitude: input.magnitude,
      investorRelevance: input.investorRelevance,
      novelty: input.novelty,
      narrativeSignificance: input.narrativeSignificance,
      contentPotential: input.contentPotential,
      humanInterest: input.humanInterest,
      explainability: input.explainability,
      evidenceConfidence: input.evidenceConfidence,
      consensusLevel: input.consensusLevel,
      contradictionSeverity: input.contradictionSeverity,
      previousState: toNullableJson(input.previousState),
      newInformation: input.newInformation,
      whatChanged: input.whatChanged,
      whyItMatters: input.whyItMatters,
      reasoning: input.reasoning,
      model: input.model,
      promptVersion: input.promptVersion,
    },
  });
}

export async function listEvaluationsByEventId(eventId: string) {
  return prisma.eventEvaluation.findMany({
    where: { eventId },
    orderBy: { createdAt: "desc" },
  });
}
