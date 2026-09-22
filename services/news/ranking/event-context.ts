import type {
  DiscoveryPeriod,
  EventEvaluation,
  EventVerification,
} from "@/db/generated/client";
import { resolveDiscoveryDateRange } from "@/domain/news/discovery-period";

export type RankableEventRow = {
  id: string;
  title: string;
  description: string | null;
  eventType: string;
  region: string;
  eventDate: Date | null;
  eventNarratives: Array<{ narrative: { title: string } }>;
};

export function decimalToNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

export function evaluationToRecord(
  evaluation: EventEvaluation | null | undefined,
): Record<string, unknown> | undefined {
  if (!evaluation) {
    return undefined;
  }
  return {
    financialSignificance: decimalToNumber(evaluation.financialSignificance),
    marketRelevance: decimalToNumber(evaluation.marketRelevance),
    economicImpact: decimalToNumber(evaluation.economicImpact),
    breadth: decimalToNumber(evaluation.breadth),
    magnitude: decimalToNumber(evaluation.magnitude),
    investorRelevance: decimalToNumber(evaluation.investorRelevance),
    novelty: decimalToNumber(evaluation.novelty),
    narrativeSignificance: decimalToNumber(evaluation.narrativeSignificance),
    contentPotential: decimalToNumber(evaluation.contentPotential),
    humanInterest: decimalToNumber(evaluation.humanInterest),
    explainability: decimalToNumber(evaluation.explainability),
    evidenceConfidence: decimalToNumber(evaluation.evidenceConfidence),
    consensusLevel: evaluation.consensusLevel,
    contradictionSeverity: evaluation.contradictionSeverity,
    whatChanged: evaluation.whatChanged,
    whyItMatters: evaluation.whyItMatters,
    newInformation: evaluation.newInformation,
  };
}

export function verificationToRecord(
  verification: EventVerification | null | undefined,
): Record<string, unknown> | undefined {
  if (!verification) {
    return undefined;
  }
  return {
    evidenceConfidence: decimalToNumber(verification.evidenceConfidence),
    primarySourceAvailable: verification.primarySourceAvailable,
    independentSourceCount: verification.independentSourceCount,
    supportingSourceCount: verification.supportingSourceCount,
    contradictingSourceCount: verification.contradictingSourceCount,
    consensusLevel: verification.consensusLevel,
    verificationStatus: verification.verificationStatus,
    reasoning: verification.reasoning,
  };
}

export function heuristicPreRankScore(input: {
  evaluation: EventEvaluation | null;
  verification: EventVerification | null;
  eventDate: Date | null;
  period: DiscoveryPeriod;
  anchorDate: Date;
}): number {
  const evaluation = input.evaluation;
  if (!evaluation) {
    return 0;
  }

  const dimensions = [
    decimalToNumber(evaluation.financialSignificance),
    decimalToNumber(evaluation.marketRelevance),
    decimalToNumber(evaluation.economicImpact),
    decimalToNumber(evaluation.breadth),
    decimalToNumber(evaluation.magnitude),
    decimalToNumber(evaluation.investorRelevance),
    decimalToNumber(evaluation.novelty),
    decimalToNumber(evaluation.narrativeSignificance),
    decimalToNumber(evaluation.contentPotential),
    decimalToNumber(evaluation.explainability),
  ].filter((value): value is number => value !== undefined);

  if (dimensions.length === 0) {
    return 0;
  }

  let score =
    dimensions.reduce((sum, value) => sum + value, 0) / dimensions.length;

  const evidenceConfidence =
    decimalToNumber(input.verification?.evidenceConfidence) ??
    decimalToNumber(evaluation.evidenceConfidence) ??
    0.5;
  score *= 0.4 + 0.6 * evidenceConfidence;

  if (input.verification?.verificationStatus === "CONTESTED") {
    score *= 0.9;
  }

  if (input.period === "DAY" && input.eventDate) {
    const ms = input.anchorDate.getTime() - input.eventDate.getTime();
    const days = Math.max(0, ms / (1000 * 60 * 60 * 24));
    score += Math.max(0, 0.1 - days * 0.03);
  }

  return Math.min(1, Math.max(0, score));
}

export function eventWithinDiscoveryPeriod(input: {
  eventDate: Date | null;
  period: DiscoveryPeriod;
  startDate?: Date | null;
  endDate?: Date | null;
  anchorDate?: Date;
}): boolean {
  if (!input.eventDate) {
    return true;
  }
  const range = resolveDiscoveryDateRange({
    period: input.period,
    startDate: input.startDate ?? undefined,
    endDate: input.endDate ?? undefined,
    anchorDate: input.anchorDate,
  });
  const day = input.eventDate.getTime();
  return (
    day >= range.startDate.getTime() && day <= range.endDate.getTime() + 86400000
  );
}
