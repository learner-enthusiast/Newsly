import type { Region } from "@/db/generated/client";
import { regionTargetsForRequest } from "@/providers/search-provider";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import { decimalToNumber } from "@/services/news/ranking/event-context";
import { serializeDiscoveryRun } from "@/lib/discovery-run-serializer";

export type DiscoveryStorySummary = {
  rank: number;
  eventId: string;
  title: string;
  description: string | null;
  eventDate: string | null;
  eventType: string;
  region: Region;
  narrativeTitle: string | null;
  whatChanged: string | null;
  whyItMatters: string | null;
  evidenceConfidence: number | null;
  primarySourceAvailable: boolean;
  independentSourceCount: number;
  supportingSourceCount: number;
  contradictingSourceCount: number;
  evaluation: {
    financialSignificance: number | null;
    marketRelevance: number | null;
    economicImpact: number | null;
    magnitude: number | null;
    investorRelevance: number | null;
    novelty: number | null;
    narrativeSignificance: number | null;
    contentPotential: number | null;
    explainability: number | null;
  };
  rankingReasoning: string | null;
};

export type DiscoveryStoryDetail = DiscoveryStorySummary & {
  narratives: string[];
  supportingSources: Array<{
    domain: string;
    name: string;
    url: string;
    relationship: string;
  }>;
  primarySources: Array<{ domain: string; name: string; url: string }>;
  contradictoryEvidence: Array<{
    severity: string;
    explanation: string | null;
  }>;
  keyClaims: Array<{ text: string; relationship: string }>;
  verificationReasoning: string | null;
  evaluationReasoning: string | null;
};

export function createDiscoveryResultsService(deps: NewsServiceDeps) {
  return {
    async getResultsForUser(discoveryRunId: string, userId: string) {
      const run = await deps.repos.discoveryRun.getDiscoveryRunForUser(
        discoveryRunId,
        userId,
      );
      if (!run) {
        return null;
      }

      const targets = regionTargetsForRequest(run.region);
      const india =
        targets.includes("INDIA")
          ? await this.loadRegionStories(discoveryRunId, "INDIA")
          : [];
      const world =
        targets.includes("WORLD")
          ? await this.loadRegionStories(discoveryRunId, "WORLD")
          : [];

      return {
        discoveryRun: serializeDiscoveryRun(run),
        india,
        world,
      };
    },

    async getStoryDetailForUser(
      discoveryRunId: string,
      eventId: string,
      userId: string,
    ) {
      const run = await deps.repos.discoveryRun.getDiscoveryRunForUser(
        discoveryRunId,
        userId,
      );
      if (!run) {
        return null;
      }

      const event = await deps.repos.event.getEventById(eventId);
      if (!event) {
        return null;
      }

      const graph = await deps.repos.event.getEventEvidenceGraph(eventId);
      if (!graph) {
        return null;
      }

      const runEventIds = new Set(
        (
          await deps.repos.event.listEventsForDiscoveryRun(discoveryRunId)
        ).map((row) => row.id),
      );
      const gapEventIds =
        await deps.repos.coverageGap.listEvaluatedGapEventIdsForDiscoveryRun(
          discoveryRunId,
          event.region,
        );
      if (!runEventIds.has(eventId) && !gapEventIds.includes(eventId)) {
        return null;
      }

      const summary = await this.buildStorySummary(
        discoveryRunId,
        event.region,
        eventId,
      );
      if (!summary) {
        return null;
      }

      const evaluation =
        await deps.repos.evaluation.getLatestEventEvaluation(eventId);
      const verification =
        await deps.repos.verification.getLatestEventVerification(eventId);

      const supportingSources = graph.eventDocuments.map((row) => ({
        domain: row.document.source.domain,
        name: row.document.source.name,
        url: row.document.url,
        relationship: row.relationship,
      }));

      const primarySources = graph.eventDocuments
        .filter(
          (row) =>
            row.document.source.sourceType === "PRIMARY" ||
            row.document.source.isPrimarySource ||
            row.relationship === "PRIMARY_SOURCE",
        )
        .map((row) => ({
          domain: row.document.source.domain,
          name: row.document.source.name,
          url: row.document.url,
        }));

      const claimIds = graph.eventClaims.map((row) => row.claim.id);
      const contradictions =
        await deps.repos.contradiction.listContradictionsForClaimIds(claimIds);

      const detail: DiscoveryStoryDetail = {
        ...summary,
        narratives: graph.eventNarratives.map((row) => row.narrative.title),
        supportingSources,
        primarySources,
        contradictoryEvidence: contradictions.map((row) => ({
          severity: row.severity,
          explanation: row.explanation,
        })),
        keyClaims: graph.eventClaims.slice(0, 12).map((row) => ({
          text: row.claim.claimText,
          relationship: row.relationship,
        })),
        verificationReasoning: verification?.reasoning ?? null,
        evaluationReasoning: evaluation?.reasoning ?? null,
      };

      return detail;
    },

    async loadRegionStories(discoveryRunId: string, region: Region) {
      const selections =
        await deps.repos.ranking.listTopStorySelectionsForDiscoveryRun(
          discoveryRunId,
          region,
        );

      const stories: DiscoveryStorySummary[] = [];
      for (const selection of selections) {
        const story = await this.buildStorySummary(
          discoveryRunId,
          region,
          selection.eventId,
          selection.rank,
        );
        if (story) {
          stories.push(story);
        }
      }
      return stories;
    },

    async buildStorySummary(
      discoveryRunId: string,
      region: Region,
      eventId: string,
      rankOverride?: number,
    ): Promise<DiscoveryStorySummary | null> {
      const event = await deps.repos.event.getEventById(eventId);
      if (!event) {
        return null;
      }

      const evaluation =
        await deps.repos.evaluation.getLatestEventEvaluation(eventId);
      const verification =
        await deps.repos.verification.getLatestEventVerification(eventId);
      const graph = await deps.repos.event.getEventEvidenceGraph(eventId);

      const finalRanking = await deps.repos.ranking.findRankingRunForDiscovery(
        discoveryRunId,
        region,
        "final-v1",
      );
      let rankingReasoning: string | null = null;
      let rank = rankOverride ?? 0;
      if (finalRanking) {
        const rankings = await deps.repos.ranking.listEventRankingsForRun(
          finalRanking.id,
        );
        const row = rankings.find((entry) => entry.eventId === eventId);
        rankingReasoning = row?.reasoning ?? null;
        rank = rankOverride ?? row?.rank ?? 0;
      }

      return {
        rank,
        eventId: event.id,
        title: event.title,
        description: event.description,
        eventDate: event.eventDate?.toISOString() ?? null,
        eventType: event.eventType,
        region: event.region,
        narrativeTitle:
          graph?.eventNarratives[0]?.narrative.title ?? null,
        whatChanged: evaluation?.whatChanged ?? null,
        whyItMatters: evaluation?.whyItMatters ?? null,
        evidenceConfidence: decimalToNumber(verification?.evidenceConfidence) ??
          decimalToNumber(evaluation?.evidenceConfidence) ??
          null,
        primarySourceAvailable: verification?.primarySourceAvailable ?? false,
        independentSourceCount: verification?.independentSourceCount ?? 0,
        supportingSourceCount: verification?.supportingSourceCount ?? 0,
        contradictingSourceCount: verification?.contradictingSourceCount ?? 0,
        evaluation: {
          financialSignificance:
            decimalToNumber(evaluation?.financialSignificance) ?? null,
          marketRelevance:
            decimalToNumber(evaluation?.marketRelevance) ?? null,
          economicImpact:
            decimalToNumber(evaluation?.economicImpact) ?? null,
          magnitude: decimalToNumber(evaluation?.magnitude) ?? null,
          investorRelevance:
            decimalToNumber(evaluation?.investorRelevance) ?? null,
          novelty: decimalToNumber(evaluation?.novelty) ?? null,
          narrativeSignificance:
            decimalToNumber(evaluation?.narrativeSignificance) ?? null,
          contentPotential:
            decimalToNumber(evaluation?.contentPotential) ?? null,
          explainability:
            decimalToNumber(evaluation?.explainability) ?? null,
        },
        rankingReasoning,
      };
    },
  };
}

export const discoveryResultsService = createDiscoveryResultsService(
  defaultNewsServiceDeps,
);
