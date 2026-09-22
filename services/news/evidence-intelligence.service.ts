import { NEWS_EVENTS } from "@/domain/news/events";
import type { ContradictionSeverity } from "@/db/generated/client";
import type { StageResult } from "@/domain/news/types/pipeline";
import {
  listContradictionsForClaimIds,
  maxContradictionSeverity,
} from "@/repositories/news/contradiction";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import {
  buildEventEvaluationPrompt,
  buildEventVerificationPrompt,
  EVENT_EVIDENCE_PROMPT_VERSION,
  EVENT_EVALUATION_SYSTEM,
  EVENT_VERIFICATION_SYSTEM,
} from "@/services/news/evidence/prompt";
import {
  eventEvaluationAssessmentSchema,
  verificationAssessmentSchema,
} from "@/services/news/evidence/schemas";
import {
  computeSourceIndependenceMetrics,
  isOfficialPrimaryPublisher,
} from "@/services/news/evidence/source-independence";

export type EvidenceProcessPlan =
  | { ok: true; discoveryRunId: string; eventIds: string[] }
  | { ok: false; discoveryRunId: string; reason: string };

export type ProcessEventEvidenceResult = {
  eventId: string;
  status: "completed" | "skipped" | "failed";
  verificationId?: string;
  evaluationId?: string;
  error?: string;
};

function isEvidenceEvaluationComplete(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const block = (metadata as Record<string, unknown>).evidenceEvaluation;
  if (!block || typeof block !== "object") {
    return false;
  }
  return (
    (block as Record<string, unknown>).promptVersion ===
      EVENT_EVIDENCE_PROMPT_VERSION &&
    typeof (block as Record<string, unknown>).completedAt === "string"
  );
}

function assertCitedIndexes(
  indexes: number[],
  max: number,
  label: string,
): void {
  for (const index of indexes) {
    if (index < 0 || index >= max) {
      throw new Error(`invalid_${label}_index:${index}`);
    }
  }
}

export function createEvidenceIntelligenceService(deps: NewsServiceDeps) {
  return {
    async buildEvidenceProcessPlan(
      discoveryRunId: string,
    ): Promise<EvidenceProcessPlan> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const events =
        await deps.repos.event.listEventsForDiscoveryRun(discoveryRunId);

      return {
        ok: true,
        discoveryRunId,
        eventIds: events.map((event) => event.id),
      };
    },

    async markEvidenceProcessRunning(
      discoveryRunId: string,
    ): Promise<StageResult> {
      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "evidence_process",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });
      return { ok: true, discoveryRunId };
    },

    async processEventEvidence(
      discoveryRunId: string,
      eventId: string,
    ): Promise<ProcessEventEvidenceResult> {
      const llm = deps.providers.llm;
      if (!llm) {
        return {
          eventId,
          status: "failed",
          error: "llm_provider_not_configured",
        };
      }

      const event = await deps.repos.event.getEventEvidenceGraph(eventId);
      if (!event) {
        return { eventId, status: "failed", error: "event_not_found" };
      }

      if (isEvidenceEvaluationComplete(event.metadata)) {
        return { eventId, status: "skipped" };
      }

      const model =
        process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4o-mini";

      try {
        const documentRows = event.eventDocuments.map((row) => ({
          documentId: row.documentId,
          relationship: row.relationship,
          isPrimaryEvidence: row.isPrimaryEvidence,
          metadata: row.metadata,
          document: {
            contentHash: row.document.contentHash,
            url: row.document.url,
            source: row.document.source,
          },
        }));

        const claimRows = event.eventClaims.map((row) => ({
          relationship: row.relationship,
          isPrimaryEvidence: row.isPrimaryEvidence,
          claim: {
            id: row.claim.id,
            documentId: row.claim.documentId,
          },
        }));

        const metrics = computeSourceIndependenceMetrics({
          eventDocuments: documentRows,
          eventClaims: claimRows,
        });

        const documents = event.eventDocuments.map((row, index) => ({
          index,
          id: row.documentId,
          title: row.document.title,
          url: row.document.url,
          domain: row.document.source.domain,
          sourceType: row.document.source.sourceType,
          isOfficialPrimary: isOfficialPrimaryPublisher(row.document.source),
          documentRelationship: row.relationship,
          contentHashPrefix: row.document.contentHash.slice(0, 12),
        }));

        const documentIndexById = new Map(
          documents.map((document) => [document.id, document.index]),
        );

        const claims = event.eventClaims.map((row, index) => ({
          index,
          id: row.claim.id,
          text: row.claim.claimText,
          relationship: row.relationship,
          documentIndex:
            documentIndexById.get(row.claim.documentId) ??
            documents.findIndex((doc) => doc.id === row.claim.documentId),
        }));

        const claimIds = claims.map((claim) => claim.id);
        const contradictionsRaw =
          await listContradictionsForClaimIds(claimIds);
        const claimIndexById = new Map(
          claims.map((claim) => [claim.id, claim.index]),
        );

        const contradictions = contradictionsRaw.map((row) => ({
          claimIndexA: claimIndexById.get(row.claimAId) ?? -1,
          claimIndexB: claimIndexById.get(row.claimBId) ?? -1,
          severity: row.severity,
          explanation: row.explanation,
        }));

        const independenceGroups = metrics.independenceGroups.map((group) => ({
          representativeDomain: group.representativeDomain,
          kind: group.kind,
          documentIndexes: group.documentIds
            .map((id) => documentIndexById.get(id))
            .filter((index): index is number => index !== undefined),
        }));

        const verificationParsed = verificationAssessmentSchema.parse(
          await llm.generateObject({
            schema: verificationAssessmentSchema,
            schemaName: "EventVerificationAssessment",
            system: EVENT_VERIFICATION_SYSTEM,
            prompt: buildEventVerificationPrompt({
              eventTitle: event.title,
              eventType: event.eventType,
              eventDescription: event.description,
              computed: {
                primarySourceAvailable: metrics.primarySourceAvailable,
                independentSourceCount: metrics.independentSourceCount,
                supportingSourceCount: metrics.supportingSourceCount,
                contradictingSourceCount: metrics.contradictingSourceCount,
                independenceGroups,
              },
              claims,
              documents,
              entities: event.eventEntities.map((row) => row.entity.name),
              narratives: event.eventNarratives.map(
                (row) => row.narrative.title,
              ),
              contradictions: contradictions.filter(
                (row) => row.claimIndexA >= 0 && row.claimIndexB >= 0,
              ),
            }),
            model,
          }),
        );

        assertCitedIndexes(
          verificationParsed.citedClaimIndexes,
          claims.length,
          "claim",
        );
        assertCitedIndexes(
          verificationParsed.citedDocumentIndexes,
          documents.length,
          "document",
        );

        const verification = await deps.repos.verification.createEventVerification(
          {
            eventId,
            evidenceConfidence: verificationParsed.evidenceConfidence,
            primarySourceAvailable: metrics.primarySourceAvailable,
            independentSourceCount: metrics.independentSourceCount,
            supportingSourceCount: metrics.supportingSourceCount,
            contradictingSourceCount: metrics.contradictingSourceCount,
            consensusLevel: verificationParsed.consensusLevel,
            verificationStatus: verificationParsed.verificationStatus,
            reasoning: verificationParsed.reasoning,
            model,
            promptVersion: EVENT_EVIDENCE_PROMPT_VERSION,
          },
        );

        const evaluationParsed = eventEvaluationAssessmentSchema.parse(
          await llm.generateObject({
            schema: eventEvaluationAssessmentSchema,
            schemaName: "EventEvaluationAssessment",
            system: EVENT_EVALUATION_SYSTEM,
            prompt: buildEventEvaluationPrompt({
              eventTitle: event.title,
              eventType: event.eventType,
              eventDescription: event.description,
              verificationSummary: {
                evidenceConfidence: verificationParsed.evidenceConfidence,
                verificationStatus: verificationParsed.verificationStatus,
                consensusLevel: verificationParsed.consensusLevel,
                primarySourceAvailable: metrics.primarySourceAvailable,
                independentSourceCount: metrics.independentSourceCount,
              },
              claims: claims.map((claim) => ({
                index: claim.index,
                text: claim.text,
                relationship: claim.relationship,
              })),
              entities: event.eventEntities.map((row) => row.entity.name),
              narratives: event.eventNarratives.map(
                (row) => row.narrative.title,
              ),
            }),
            model,
          }),
        );

        assertCitedIndexes(
          evaluationParsed.citedClaimIndexes,
          claims.length,
          "claim",
        );

        const contradictionSeverity = maxContradictionSeverity(
          contradictionsRaw,
        ) as ContradictionSeverity | undefined;

        const evaluation = await deps.repos.evaluation.createEventEvaluation({
          eventId,
          financialSignificance: evaluationParsed.financialSignificance,
          marketRelevance: evaluationParsed.marketRelevance,
          economicImpact: evaluationParsed.economicImpact,
          breadth: evaluationParsed.breadth,
          magnitude: evaluationParsed.magnitude,
          investorRelevance: evaluationParsed.investorRelevance,
          novelty: evaluationParsed.novelty,
          narrativeSignificance: evaluationParsed.narrativeSignificance,
          contentPotential: evaluationParsed.contentPotential,
          humanInterest: evaluationParsed.humanInterest,
          explainability: evaluationParsed.explainability,
          evidenceConfidence: verificationParsed.evidenceConfidence,
          consensusLevel: verificationParsed.consensusLevel,
          contradictionSeverity,
          previousState: evaluationParsed.previousState
            ? { summary: evaluationParsed.previousState }
            : undefined,
          newInformation: evaluationParsed.newInformation,
          whatChanged: evaluationParsed.whatChanged,
          whyItMatters: evaluationParsed.whyItMatters,
          reasoning: evaluationParsed.reasoning,
          model,
          promptVersion: EVENT_EVIDENCE_PROMPT_VERSION,
        });

        await deps.repos.event.mergeEventMetadata(eventId, {
          evidenceEvaluation: {
            promptVersion: EVENT_EVIDENCE_PROMPT_VERSION,
            model,
            completedAt: new Date().toISOString(),
            discoveryRunId,
            verificationId: verification.id,
            evaluationId: evaluation.id,
            sourceMetrics: metrics,
            preserveDisagreement: verificationParsed.preserveDisagreement,
          },
        });

        return {
          eventId,
          status: "completed",
          verificationId: verification.id,
          evaluationId: evaluation.id,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "evidence_process_failed";
        await deps.repos.event.mergeEventMetadata(eventId, {
          evidenceEvaluation: {
            promptVersion: EVENT_EVIDENCE_PROMPT_VERSION,
            model,
            failedAt: new Date().toISOString(),
            discoveryRunId,
            error: message,
          },
        });
        return { eventId, status: "failed", error: message };
      }
    },

    async finalizeEvidenceProcess(
      discoveryRunId: string,
      results: ProcessEventEvidenceResult[],
    ): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const prior = run.metadata as Record<string, unknown> | null;
      const priorBlock = prior?.evidenceIntelligence;
      if (
        priorBlock &&
        typeof priorBlock === "object" &&
        typeof (priorBlock as Record<string, unknown>).completedAt === "string"
      ) {
        return { ok: true, discoveryRunId };
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "evidence_process",
        pipelineStageUpdatedAt: new Date().toISOString(),
        evidenceIntelligence: {
          completedAt: new Date().toISOString(),
          promptVersion: EVENT_EVIDENCE_PROMPT_VERSION,
          eventsProcessed: results.length,
          eventsCompleted: results.filter((row) => row.status === "completed")
            .length,
          eventsSkipped: results.filter((row) => row.status === "skipped")
            .length,
          eventsFailed: results.filter((row) => row.status === "failed")
            .length,
        },
      });

      await deps.events.send(NEWS_EVENTS.EVIDENCE_PROCESSED, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export const evidenceIntelligenceService = createEvidenceIntelligenceService(
  defaultNewsServiceDeps,
);
