import { NEWS_EVENTS } from "@/domain/news/events";
import { normalizeEntityName } from "@/domain/news/normalize-entity-name";
import { normalizeEventTitle } from "@/domain/news/normalize-event-title";
import type { EventClaimRelationship } from "@/db/generated/client";
import type { StageResult } from "@/domain/news/types/pipeline";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import {
  buildEventMetadata,
  pickBestEventMatch,
  readEventActionState,
  resolveEventRegion,
  scoreEventCandidateMatch,
} from "@/services/news/events/matching";
import {
  buildEventExtractionPrompt,
  EVENT_EXTRACTION_PROMPT_VERSION,
  EVENT_EXTRACTION_SYSTEM,
} from "@/services/news/events/prompt";
import {
  documentEventExtractionSchema,
  eventMergeAdjudicationSchema,
  type ExtractedEventCandidate,
} from "@/services/news/events/schemas";
import { createNarrativeIntelligenceService } from "@/services/news/narrative-intelligence.service";

export type EventProcessPlan =
  | { ok: true; discoveryRunId: string; documentIds: string[] }
  | { ok: false; discoveryRunId: string; reason: string };

export type ProcessDocumentEventsResult = {
  documentId: string;
  status: "completed" | "skipped" | "failed";
  eventsCreated: number;
  eventsLinked: number;
  contradictionsCreated: number;
  error?: string;
};

function isEventExtractionComplete(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const block = (metadata as Record<string, unknown>).eventExtraction;
  if (!block || typeof block !== "object") {
    return false;
  }
  return (
    (block as Record<string, unknown>).promptVersion ===
      EVENT_EXTRACTION_PROMPT_VERSION &&
    typeof (block as Record<string, unknown>).completedAt === "string"
  );
}

export function createEventIntelligenceService(deps: NewsServiceDeps) {
  const narratives = createNarrativeIntelligenceService(deps);

  return {
    async buildEventProcessPlan(
      discoveryRunId: string,
    ): Promise<EventProcessPlan> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const documents =
        await deps.repos.document.listDocumentsForUnderstanding(discoveryRunId);

      return {
        ok: true,
        discoveryRunId,
        documentIds: documents.map((document) => document.id),
      };
    },

    async markEventProcessRunning(
      discoveryRunId: string,
    ): Promise<StageResult> {
      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "event_process",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });
      return { ok: true, discoveryRunId };
    },

    async processDocumentEvents(
      discoveryRunId: string,
      documentId: string,
    ): Promise<ProcessDocumentEventsResult> {
      const llm = deps.providers.llm;
      if (!llm) {
        return {
          documentId,
          status: "failed",
          eventsCreated: 0,
          eventsLinked: 0,
          contradictionsCreated: 0,
          error: "llm_provider_not_configured",
        };
      }

      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return {
          documentId,
          status: "failed",
          eventsCreated: 0,
          eventsLinked: 0,
          contradictionsCreated: 0,
          error: "discovery_run_not_found",
        };
      }

      const document = await deps.repos.document.getDocumentById(documentId);
      if (!document) {
        return {
          documentId,
          status: "failed",
          eventsCreated: 0,
          eventsLinked: 0,
          contradictionsCreated: 0,
          error: "document_not_found",
        };
      }

      if (isEventExtractionComplete(document.metadata)) {
        return {
          documentId,
          status: "skipped",
          eventsCreated: 0,
          eventsLinked: 0,
          contradictionsCreated: 0,
        };
      }

      const claims =
        await deps.repos.claim.listClaimsByDocumentWithEntities(documentId);
      if (claims.length === 0) {
        await deps.repos.document.mergeDocumentMetadata(documentId, {
          eventExtraction: {
            promptVersion: EVENT_EXTRACTION_PROMPT_VERSION,
            completedAt: new Date().toISOString(),
            skipped: "no_claims",
          },
        });
        return {
          documentId,
          status: "skipped",
          eventsCreated: 0,
          eventsLinked: 0,
          contradictionsCreated: 0,
        };
      }

      const model =
        process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4o-mini";
      const region = resolveEventRegion(
        run.region,
        document.sourceId
          ? (await deps.repos.source.getSourceById(document.sourceId))?.region
          : undefined,
      );

      try {
        const extraction = documentEventExtractionSchema.parse(
          await llm.generateObject({
            schema: documentEventExtractionSchema,
            schemaName: "DocumentEventExtraction",
            system: EVENT_EXTRACTION_SYSTEM,
            prompt: buildEventExtractionPrompt({
              documentTitle: document.title,
              documentUrl: document.url,
              claims: claims.map((claim, index) => ({
                index,
                text: claim.claimText,
                claimType: claim.claimType,
              })),
            }),
            model,
          }),
        );

        let eventsCreated = 0;
        let eventsLinked = 0;
        const eventIdsFromDoc: string[] = [];

        for (const candidate of extraction.events) {
          const persisted = await this.persistEventCandidate({
            discoveryRunId,
            documentId,
            region,
            candidate,
            claims,
            model,
          });
          if (persisted.created) {
            eventsCreated += 1;
          } else {
            eventsLinked += 1;
          }
          eventIdsFromDoc.push(persisted.eventId);
        }

        let contradictionsCreated = 0;
        for (const contradiction of extraction.contradictions) {
          const claimA = claims[contradiction.claimIndexA];
          const claimB = claims[contradiction.claimIndexB];
          if (!claimA || !claimB || claimA.id === claimB.id) {
            continue;
          }

          const existing =
            await deps.repos.contradiction.findContradictionByClaimPair(
              claimA.id,
              claimB.id,
            );
          if (existing) {
            continue;
          }

          await deps.repos.contradiction.createContradiction({
            claimAId: claimA.id,
            claimBId: claimB.id,
            contradictionType: contradiction.contradictionType,
            severity: contradiction.severity,
            explanation: contradiction.explanation,
            confidence: contradiction.confidence,
          });
          contradictionsCreated += 1;
        }

        await deps.repos.document.mergeDocumentMetadata(documentId, {
          eventExtraction: {
            promptVersion: EVENT_EXTRACTION_PROMPT_VERSION,
            model,
            completedAt: new Date().toISOString(),
            eventsCreated,
            eventsLinked,
            contradictionsCreated,
            eventIds: eventIdsFromDoc,
          },
        });

        return {
          documentId,
          status: "completed",
          eventsCreated,
          eventsLinked,
          contradictionsCreated,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "event_extraction_failed";
        await deps.repos.document.mergeDocumentMetadata(documentId, {
          eventExtraction: {
            promptVersion: EVENT_EXTRACTION_PROMPT_VERSION,
            model,
            failedAt: new Date().toISOString(),
            error: message,
          },
        });
        return {
          documentId,
          status: "failed",
          eventsCreated: 0,
          eventsLinked: 0,
          contradictionsCreated: 0,
          error: message,
        };
      }
    },

    async persistEventCandidate(input: {
      discoveryRunId: string;
      documentId: string;
      region: ReturnType<typeof resolveEventRegion>;
      candidate: ExtractedEventCandidate;
      claims: Awaited<
        ReturnType<typeof deps.repos.claim.listClaimsByDocumentWithEntities>
      >;
      model: string;
    }) {
      const claimEntityIds = new Set<string>();
      for (const index of input.candidate.claimIndexes) {
        const claim = input.claims[index];
        if (!claim) {
          continue;
        }
        for (const row of claim.claimEntities) {
          claimEntityIds.add(row.entityId);
        }
      }

      const searchEntityIds = [...claimEntityIds];
      const pool = await deps.repos.event.listActiveEventsByEntityIds(
        searchEntityIds,
        input.region,
      );

      let targetEvent = pickBestEventMatch(input.candidate, pool)?.event ?? null;
      let created = false;

      if (targetEvent) {
        const ambiguous =
          scoreEventCandidateMatch(input.candidate, targetEvent) >= 0.45 &&
          scoreEventCandidateMatch(input.candidate, targetEvent) < 0.72;

        if (ambiguous && deps.providers.llm) {
          const adjudication = eventMergeAdjudicationSchema.parse(
            await deps.providers.llm.generateObject({
              schema: eventMergeAdjudicationSchema,
              schemaName: "EventMergeAdjudication",
              system:
                "Decide whether two event descriptions refer to the same real-world event. Different action states (considering vs completed) must NOT merge.",
              prompt: `Existing event:
Title: ${targetEvent.title}
Action state: ${readEventActionState(targetEvent.metadata) ?? "unknown"}
Type: ${targetEvent.eventType}

Candidate:
Title: ${input.candidate.title}
Action state: ${input.candidate.actionState}
Type: ${input.candidate.eventType}`,
              model: input.model,
            }),
          );
          if (!adjudication.merge) {
            targetEvent = null;
          }
        }
      }

      if (!targetEvent) {
        targetEvent = await deps.repos.event.createEvent({
          title: input.candidate.title.trim(),
          normalizedTitle: normalizeEventTitle(input.candidate.title),
          description: input.candidate.description,
          eventType: input.candidate.eventType,
          region: input.region,
          eventDate: input.candidate.eventDate
            ? new Date(input.candidate.eventDate)
            : undefined,
          metadata: buildEventMetadata(input.candidate, input.discoveryRunId),
        });
        created = true;
      } else {
        await deps.repos.event.mergeEventMetadata(targetEvent.id, {
          lastLinkedDiscoveryRunId: input.discoveryRunId,
        });
      }

      const claimRelationship = input.candidate
        .claimRelationship as EventClaimRelationship;
      for (const index of input.candidate.claimIndexes) {
        const claim = input.claims[index];
        if (!claim) {
          continue;
        }
        await deps.repos.event.linkEventClaim({
          eventId: targetEvent.id,
          claimId: claim.id,
          relationship: claimRelationship,
          evidenceStrength: claim.confidence
            ? Number(claim.confidence)
            : undefined,
          isPrimaryEvidence: input.candidate.documentRelationship === "PRIMARY_SOURCE",
        });
      }

      await deps.repos.event.linkEventDocument({
        eventId: targetEvent.id,
        documentId: input.documentId,
        relationship: input.candidate.documentRelationship,
        isPrimaryEvidence:
          input.candidate.documentRelationship === "PRIMARY_SOURCE",
        metadata: {
          syndicated: false,
        },
      });

      for (const entityId of searchEntityIds) {
        await deps.repos.entity.linkEventEntity(targetEvent.id, entityId);
      }

      for (const name of input.candidate.entityNames) {
        const normalized = normalizeEntityName(name);
        if (!normalized) {
          continue;
        }
        const entity = await deps.repos.entity.findEntityByNormalizedName(
          normalized,
        );
        if (entity) {
          await deps.repos.entity.linkEventEntity(targetEvent.id, entity.id);
        }
      }

      return { eventId: targetEvent.id, created };
    },

    async detectNarratives(discoveryRunId: string) {
      return narratives.detectNarrativesForRun(discoveryRunId);
    },

    async finalizeEventProcess(
      discoveryRunId: string,
      docResults: ProcessDocumentEventsResult[],
      narrativeStats: Awaited<
        ReturnType<typeof narratives.detectNarrativesForRun>
      >,
    ): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      const prior = run.metadata as Record<string, unknown> | null;
      const priorBlock = prior?.eventIntelligence;
      if (
        priorBlock &&
        typeof priorBlock === "object" &&
        typeof (priorBlock as Record<string, unknown>).completedAt === "string"
      ) {
        return { ok: true, discoveryRunId };
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "event_process",
        pipelineStageUpdatedAt: new Date().toISOString(),
        eventIntelligence: {
          completedAt: new Date().toISOString(),
          documentsProcessed: docResults.length,
          eventsCreated: docResults.reduce(
            (sum, row) => sum + row.eventsCreated,
            0,
          ),
          eventsLinked: docResults.reduce(
            (sum, row) => sum + row.eventsLinked,
            0,
          ),
          contradictionsCreated: docResults.reduce(
            (sum, row) => sum + row.contradictionsCreated,
            0,
          ),
          documentsFailed: docResults.filter((row) => row.status === "failed")
            .length,
          narratives: narrativeStats,
        },
      });

      await deps.events.send(NEWS_EVENTS.EVENTS_PROCESSED, { discoveryRunId });
      return { ok: true, discoveryRunId };
    },
  };
}

export const eventIntelligenceService = createEventIntelligenceService(
  defaultNewsServiceDeps,
);
