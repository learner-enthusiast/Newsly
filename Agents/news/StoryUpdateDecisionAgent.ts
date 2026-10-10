/**
 * Story update decision agent (rerun — rewrite vs attach-only)
 *
 * Role:
 * For one existing story and a set of **newly matched** sources, judge whether the story body
 * should be re-synthesized (`shouldUpdate: true`) or sources should merely be linked
 * (`shouldUpdate: false`) when evidence is redundant or immaterial.
 *
 * Called from:
 * - `inngest/reRunPipeline.ts` — inside `apply-rerun-outcomes` per `StoryMatcher` match
 *
 * Model: `NEWS_STORY_UPDATE_DECISION_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini`.
 * Conservative system prompt — avoids unnecessary full rewrites.
 *
 * Input:
 * - `existingStory` — id, title, summary excerpt, content excerpt
 * - `existingSources[]` — title, url, excerpt
 * - `newEvidence[]` — same shape for newly discovered sources
 *
 * Output: `{ shouldUpdate: boolean, reason: string }` — reason surfaced in rerun result logs.
 *
 * Does not: call `NewsSynthesizerAgent` itself; pipeline branches on `shouldUpdate`.
 */

import { createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const existingStorySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  summary: z.string().min(1),
  contentExcerpt: z.string().min(1),
});

const existingSourceSchema = z.object({
  title: z.string().min(1),
  url: z.string().min(1),
  excerpt: z.string().min(1),
});

const newEvidenceSchema = z.object({
  title: z.string().min(1),
  excerpt: z.string().min(1),
  url: z.string().min(1).optional(),
});

export const storyUpdateDecisionParamsSchema = z.object({
  existingStory: existingStorySchema,
  existingSources: z.array(existingSourceSchema),
  newEvidence: z.array(newEvidenceSchema).min(1),
  model: z.string().min(1).optional(),
});

export type StoryUpdateDecisionParams = z.input<
  typeof storyUpdateDecisionParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const storyUpdateDecisionOutputSchema = z.object({
  shouldUpdate: z.boolean(),
  reason: z.string().min(1).max(600),
  meaningfulChanges: z.array(z.string().min(1).max(300)),
});

export type StoryUpdateDecisionResult = z.infer<
  typeof storyUpdateDecisionOutputSchema
>;

function resolveStoryUpdateDecisionModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.NEWS_STORY_UPDATE_DECISION_MODEL,
  );
}

const SYSTEM = [
  "You decide if newly discovered sources materially update an existing news story.",
  "Return shouldUpdate=false when new evidence only repeats known reporting or adds no new facts.",
  "Return shouldUpdate=true for new developments, decisions, numbers, participants, timeline events, or confirmations.",
  "Be conservative — avoid unnecessary full story rewrites.",
].join("\n");

export async function runStoryUpdateDecisionAgent(
  params: StoryUpdateDecisionParams,
  options: AIClientOptions = {},
): Promise<StoryUpdateDecisionResult> {
  const { abortSignal, ...raw } = params;
  const parsed = storyUpdateDecisionParamsSchema.parse(raw);
  const generate = createAIClient(options).generate;

  const rawOut = await generate({
    model: resolveStoryUpdateDecisionModel(parsed.model),
    system: SYSTEM,
    prompt: "Should this existing story be re-synthesized with the new evidence?",
    extraContext: {
      existingStory: parsed.existingStory,
      existingSources: parsed.existingSources,
      newEvidence: parsed.newEvidence,
    },
    output: storyUpdateDecisionOutputSchema,
    abortSignal,
    maxOutputTokens: 2048,
  });

  return storyUpdateDecisionOutputSchema.parse(rawOut);
}
