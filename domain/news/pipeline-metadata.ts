import type { PipelineStage } from "@/domain/news/types/pipeline";

export type DiscoveryRunMetadata = {
  pipelineStage?: PipelineStage;
  pipelineStageUpdatedAt?: string;
  failureReason?: string;
  failureStage?: string;
};

export function parseDiscoveryRunMetadata(
  metadata: unknown,
): DiscoveryRunMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }
  const record = metadata as Record<string, unknown>;
  return {
    pipelineStage:
      typeof record.pipelineStage === "string"
        ? (record.pipelineStage as PipelineStage)
        : undefined,
    pipelineStageUpdatedAt:
      typeof record.pipelineStageUpdatedAt === "string"
        ? record.pipelineStageUpdatedAt
        : undefined,
    failureReason:
      typeof record.failureReason === "string"
        ? record.failureReason
        : undefined,
    failureStage:
      typeof record.failureStage === "string" ? record.failureStage : undefined,
  };
}
