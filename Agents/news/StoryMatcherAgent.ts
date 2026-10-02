/**
 * Story matcher agent (news rerun)
 *
 * Maps newly researched evidence to existing NewsStory rows or new story candidates.
 */

import { createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const storyMatcherInputStorySchema = z.object({
  id: z.uuid(),
  title: z.string().min(1),
  summary: z.string().min(1),
  category: z.string().min(1),
});

const storyMatcherEvidenceSchema = z.object({
  resourceId: z.string().min(1),
  kind: z.enum(["article", "youtube"]),
  title: z.string().min(1),
  excerpt: z.string().min(1),
  url: z.string().min(1).optional(),
});

export const storyMatcherParamsSchema = z.object({
  existingStories: z.array(storyMatcherInputStorySchema),
  newEvidence: z.array(storyMatcherEvidenceSchema).min(1),
  model: z.string().min(1).optional(),
});

export type StoryMatcherParams = z.input<typeof storyMatcherParamsSchema> & {
  abortSignal?: AbortSignal;
};

const storyMatcherOutputSchema = z.object({
  matches: z.array(
    z.object({
      resourceIds: z.array(z.string().min(1)).min(1),
      storyId: z.uuid(),
      confidence: z.number().min(0).max(1),
      reason: z.string().min(1).max(500),
    }),
  ),
  newStoryCandidates: z.array(
    z.object({
      resourceIds: z.array(z.string().min(1)).min(1),
      topic: z.string().min(1).max(200),
      reason: z.string().min(1).max(500),
    }),
  ),
});

export type StoryMatcherResult = z.infer<typeof storyMatcherOutputSchema>;

function resolveStoryMatcherModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.NEWS_STORY_MATCHER_MODEL);
}

const SYSTEM = [
  "You match newly discovered news evidence to EXISTING stories from a prior briefing run.",
  "Do NOT match on title wording alone — reason about the underlying event, entities, timeline, and claims.",
  "Multiple new resources may belong to the same existing story.",
  "If evidence describes a genuinely different event/topic, put it in newStoryCandidates.",
  "Every input resourceId must appear in exactly one match OR one newStoryCandidate.",
  "Use only story ids from existingStories.",
  "Prefer fewer, higher-confidence matches over forcing everything into existing stories.",
].join("\n");

export async function runStoryMatcherAgent(
  params: StoryMatcherParams,
  options: AIClientOptions = {},
): Promise<StoryMatcherResult> {
  const { abortSignal, ...raw } = params;
  const parsed = storyMatcherParamsSchema.parse(raw);
  const generate = createAIClient(options).generate;

  const rawOut = await generate({
    model: resolveStoryMatcherModel(parsed.model),
    system: SYSTEM,
    prompt:
      "Assign each new evidence resource to an existing story or a new story candidate.",
    extraContext: {
      existingStories: parsed.existingStories,
      newEvidence: parsed.newEvidence,
    },
    output: storyMatcherOutputSchema,
    abortSignal,
    maxOutputTokens: 4096,
  });

  return storyMatcherOutputSchema.parse(rawOut);
}

