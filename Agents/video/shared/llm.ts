import type { AIGenerateParams } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import type { z } from "zod";

/** Structured-output LLM call; same contract as `aiClient.generate`. */
export type VideoGenerate = <SCHEMA extends z.ZodType>(
  params: AIGenerateParams<SCHEMA>,
) => Promise<z.output<SCHEMA>>;

/**
 * Default for video agents. Tested on real stories (2026-10-22): gpt-4o-mini
 * wrote ~30% under the length target and extracted fewer facts; gpt-4.1-mini
 * met the 60–140s targets and passed fact check without dropping beats.
 */
export const DEFAULT_VIDEO_MODEL = "gpt-4.1-mini";

/** override → `VIDEO_SCRIPT_MODEL` → `DEFAULT_VIDEO_MODEL` (not `OPENAI_MODEL`). */
export function resolveVideoModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.VIDEO_SCRIPT_MODEL?.trim() || DEFAULT_VIDEO_MODEL,
  );
}

/** Lazily imports the shared AI client so tests with a fake need no keys. */
export const defaultVideoGenerate: VideoGenerate = async (params) => {
  const { aiClient } = await import("@/clients/AIClient");
  return aiClient.generate(params);
};
