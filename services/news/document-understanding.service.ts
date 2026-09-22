import { NEWS_EVENTS } from "@/domain/news/events";
import {
  normalizeClaimText,
  normalizeEntityName,
} from "@/domain/news/normalize-entity-name";
import type { EntityType } from "@/db/generated/client";
import type { StageResult } from "@/domain/news/types/pipeline";
import { mapWithConcurrency } from "@/lib/async-pool";
import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";
import {
  buildDocumentUnderstandingPrompt,
  DOCUMENT_UNDERSTANDING_PROMPT_VERSION,
  DOCUMENT_UNDERSTANDING_SYSTEM,
} from "@/services/news/understanding/prompt";
import {
  documentUnderstandingOutputSchema,
  type ExtractedClaim,
  type ExtractedEntity,
} from "@/services/news/understanding/schemas";

const UNDERSTAND_CONCURRENCY = Number(
  process.env.DOCUMENT_UNDERSTAND_CONCURRENCY ?? 4,
);
const UNDERSTAND_BATCH_SIZE = Number(
  process.env.DOCUMENT_UNDERSTAND_BATCH_SIZE ?? 8,
);
const MAX_DOCUMENT_CHARS = Number(
  process.env.DOCUMENT_UNDERSTAND_MAX_CHARS ?? 14_000,
);

export type UnderstandPlanResult =
  | { ok: true; discoveryRunId: string; documentIds: string[] }
  | { ok: false; discoveryRunId: string; reason: string };

export type UnderstandDocumentResult = {
  documentId: string;
  status: "completed" | "skipped" | "failed";
  entitiesCreated: number;
  entitiesLinked: number;
  claimsCreated: number;
  error?: string;
};

function entityKey(entityType: EntityType, normalizedName: string) {
  return `${entityType}:${normalizedName}`;
}

function resolveEntityIdFromMap(
  name: string,
  entityIdByKey: Map<string, string>,
): string | undefined {
  const normalized = normalizeEntityName(name);
  if (!normalized) {
    return undefined;
  }
  for (const [key, id] of entityIdByKey.entries()) {
    if (key.endsWith(`:${normalized}`)) {
      return id;
    }
  }
  return undefined;
}

function truncateContent(content: string) {
  if (content.length <= MAX_DOCUMENT_CHARS) {
    return content;
  }
  return `${content.slice(0, MAX_DOCUMENT_CHARS)}\n\n[truncated]`;
}

function isUnderstandingComplete(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return false;
  }
  const understanding = (metadata as Record<string, unknown>).understanding;
  if (!understanding || typeof understanding !== "object") {
    return false;
  }
  const record = understanding as Record<string, unknown>;
  return (
    record.promptVersion === DOCUMENT_UNDERSTANDING_PROMPT_VERSION &&
    typeof record.completedAt === "string"
  );
}

export function createDocumentUnderstandingService(deps: NewsServiceDeps) {
  return {
    async buildUnderstandPlan(
      discoveryRunId: string,
    ): Promise<UnderstandPlanResult> {
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

    chunkDocumentIds(documentIds: string[]): string[][] {
      const batches: string[][] = [];
      for (let i = 0; i < documentIds.length; i += UNDERSTAND_BATCH_SIZE) {
        batches.push(documentIds.slice(i, i + UNDERSTAND_BATCH_SIZE));
      }
      return batches;
    },

    async markUnderstandRunning(discoveryRunId: string): Promise<StageResult> {
      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "document_understand",
        pipelineStageUpdatedAt: new Date().toISOString(),
      });
      return { ok: true, discoveryRunId };
    },

    async understandDocument(documentId: string): Promise<UnderstandDocumentResult> {
      const llm = deps.providers.llm;
      if (!llm) {
        return {
          documentId,
          status: "failed",
          entitiesCreated: 0,
          entitiesLinked: 0,
          claimsCreated: 0,
          error: "llm_provider_not_configured",
        };
      }

      const document = await deps.repos.document.getDocumentById(documentId);
      if (!document) {
        return {
          documentId,
          status: "failed",
          entitiesCreated: 0,
          entitiesLinked: 0,
          claimsCreated: 0,
          error: "document_not_found",
        };
      }

      if (isUnderstandingComplete(document.metadata)) {
        return {
          documentId,
          status: "skipped",
          entitiesCreated: 0,
          entitiesLinked: 0,
          claimsCreated: 0,
        };
      }

      if (document.scrapeStatus !== "COMPLETED" || !document.content.trim()) {
        return {
          documentId,
          status: "skipped",
          entitiesCreated: 0,
          entitiesLinked: 0,
          claimsCreated: 0,
          error: "document_not_ready",
        };
      }

      const model =
        process.env.OPENAI_MODEL ?? process.env.AI_MODEL ?? "gpt-4o-mini";

      try {
        const parsed = documentUnderstandingOutputSchema.parse(
          await llm.generateObject({
            schema: documentUnderstandingOutputSchema,
            schemaName: "DocumentUnderstanding",
            system: DOCUMENT_UNDERSTANDING_SYSTEM,
            prompt: buildDocumentUnderstandingPrompt({
              title: document.title,
              url: document.url,
              publishedAt: document.publishedAt?.toISOString(),
              content: truncateContent(document.content),
            }),
            model,
          }),
        );

        const entityIdByKey = new Map<string, string>();
        let entitiesCreated = 0;
        let entitiesLinked = 0;

        for (const entity of parsed.entities) {
          const persisted = await this.persistEntity(documentId, entity);
          if (persisted.created) {
            entitiesCreated += 1;
          }
          entitiesLinked += 1;
          entityIdByKey.set(
            entityKey(persisted.entityType, persisted.normalizedName),
            persisted.entityId,
          );
          for (const alias of entity.aliases) {
            const aliasNorm = normalizeEntityName(alias);
            if (aliasNorm) {
              entityIdByKey.set(
                entityKey(persisted.entityType, aliasNorm),
                persisted.entityId,
              );
            }
          }
        }

        let claimsCreated = 0;
        for (const claim of parsed.claims) {
          const created = await this.persistClaim(
            documentId,
            claim,
            entityIdByKey,
            model,
          );
          if (created) {
            claimsCreated += 1;
          }
        }

        await deps.repos.document.mergeDocumentMetadata(documentId, {
          understanding: {
            promptVersion: DOCUMENT_UNDERSTANDING_PROMPT_VERSION,
            model,
            completedAt: new Date().toISOString(),
            entitiesExtracted: parsed.entities.length,
            claimsExtracted: parsed.claims.length,
          },
        });

        return {
          documentId,
          status: "completed",
          entitiesCreated,
          entitiesLinked,
          claimsCreated,
        };
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "understanding_failed";

        await deps.repos.document.mergeDocumentMetadata(documentId, {
          understanding: {
            promptVersion: DOCUMENT_UNDERSTANDING_PROMPT_VERSION,
            model,
            failedAt: new Date().toISOString(),
            error: message,
          },
        });

        return {
          documentId,
          status: "failed",
          entitiesCreated: 0,
          entitiesLinked: 0,
          claimsCreated: 0,
          error: message,
        };
      }
    },

    async persistEntity(documentId: string, entity: ExtractedEntity) {
      const normalizedName = normalizeEntityName(entity.name);
      if (!normalizedName) {
        throw new Error("entity_name_empty");
      }

      let record = await deps.repos.entity.findEntityByTypeAndNormalizedName(
        entity.entityType,
        normalizedName,
      );

      let created = false;
      if (!record) {
        record = await deps.repos.entity.createEntity({
          entityType: entity.entityType,
          name: entity.name.trim(),
          normalizedName,
          metadata: {
            aliases: entity.aliases,
            context: entity.context,
          },
        });
        created = true;
      }

      await deps.repos.entity.linkDocumentEntity(
        documentId,
        record.id,
        entity.context,
      );

      return {
        entityId: record.id,
        entityType: entity.entityType,
        normalizedName,
        created,
      };
    },

    async persistClaim(
      documentId: string,
      claim: ExtractedClaim,
      entityIdByKey: Map<string, string>,
      model: string,
    ) {
      const normalizedClaim = normalizeClaimText(claim.claimText);
      if (normalizedClaim.length < 8) {
        return false;
      }

      const existing =
        await deps.repos.claim.findClaimByDocumentAndNormalizedText(
          documentId,
          normalizedClaim,
        );
      if (existing) {
        return false;
      }

      const created = await deps.repos.claim.createClaim({
        documentId,
        claimType: claim.claimType,
        claimText: claim.claimText.trim(),
        normalizedClaim,
        confidence: claim.confidence,
        metadata: {
          promptVersion: DOCUMENT_UNDERSTANDING_PROMPT_VERSION,
          model,
        },
      });

      for (const name of claim.relatedEntityNames) {
        const entityId = resolveEntityIdFromMap(name, entityIdByKey);
        if (entityId) {
          await deps.repos.entity.linkClaimEntity(created.id, entityId);
        }
      }

      return true;
    },

    async understandBatch(documentIds: string[]) {
      return mapWithConcurrency(documentIds, UNDERSTAND_CONCURRENCY, (id) =>
        this.understandDocument(id),
      );
    },

    async finalizeUnderstanding(
      discoveryRunId: string,
      results: UnderstandDocumentResult[],
    ): Promise<StageResult> {
      const run = await deps.repos.discoveryRun.getDiscoveryRunById(
        discoveryRunId,
      );
      if (!run) {
        return { ok: false, discoveryRunId, reason: "discovery_run_not_found" };
      }

      await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(discoveryRunId, {
        pipelineStage: "document_understand",
        pipelineStageUpdatedAt: new Date().toISOString(),
        documentUnderstanding: {
          completedAt: new Date().toISOString(),
          documentsProcessed: results.length,
          documentsCompleted: results.filter((r) => r.status === "completed")
            .length,
          documentsSkipped: results.filter((r) => r.status === "skipped").length,
          documentsFailed: results.filter((r) => r.status === "failed").length,
          entitiesCreated: results.reduce(
            (sum, row) => sum + row.entitiesCreated,
            0,
          ),
          claimsCreated: results.reduce(
            (sum, row) => sum + row.claimsCreated,
            0,
          ),
        },
      });

      await deps.events.send(NEWS_EVENTS.DOCUMENTS_UNDERSTOOD, {
        discoveryRunId,
      });

      return { ok: true, discoveryRunId };
    },
  };
}

export type DocumentUnderstandingService = ReturnType<
  typeof createDocumentUnderstandingService
>;

export const documentUnderstandingService = createDocumentUnderstandingService(
  defaultNewsServiceDeps,
);
