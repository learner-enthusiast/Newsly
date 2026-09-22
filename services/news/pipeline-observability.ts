import type { NewsServiceDeps } from "@/services/news/deps";
import { defaultNewsServiceDeps } from "@/services/news/deps";

export type PipelineObservabilityEntry = {
  discoveryRunId: string;
  stage: string;
  status: "started" | "completed" | "failed";
  durationMs?: number;
  counts?: Record<string, number>;
  error?: string;
  retry?: number;
};

export async function appendPipelineObservability(
  deps: NewsServiceDeps,
  entry: PipelineObservabilityEntry,
) {
  const run = await deps.repos.discoveryRun.getDiscoveryRunById(
    entry.discoveryRunId,
  );
  if (!run) {
    return;
  }

  const meta =
    run.metadata && typeof run.metadata === "object" && !Array.isArray(run.metadata)
      ? (run.metadata as Record<string, unknown>)
      : {};

  const existing = Array.isArray(meta.pipelineObservability)
    ? (meta.pipelineObservability as PipelineObservabilityEntry[])
    : [];

  await deps.repos.discoveryRun.mergeDiscoveryRunMetadata(
    entry.discoveryRunId,
    {
      pipelineObservability: [
        ...existing,
        {
          ...entry,
          recordedAt: new Date().toISOString(),
        },
      ],
    },
  );
}

export async function runWithPipelineObservability<T>(
  deps: NewsServiceDeps,
  input: {
    discoveryRunId: string;
    stage: string;
    run: () => Promise<T>;
    countKeys?: (result: T) => Record<string, number>;
  },
): Promise<T> {
  const started = Date.now();
  await appendPipelineObservability(deps, {
    discoveryRunId: input.discoveryRunId,
    stage: input.stage,
    status: "started",
  });

  try {
    const result = await input.run();
    await appendPipelineObservability(deps, {
      discoveryRunId: input.discoveryRunId,
      stage: input.stage,
      status: "completed",
      durationMs: Date.now() - started,
      counts: input.countKeys?.(result),
    });
    return result;
  } catch (error) {
    await appendPipelineObservability(deps, {
      discoveryRunId: input.discoveryRunId,
      stage: input.stage,
      status: "failed",
      durationMs: Date.now() - started,
      error: error instanceof Error ? error.message : "stage_failed",
    });
    throw error;
  }
}

export const pipelineObservabilityDeps = defaultNewsServiceDeps;
