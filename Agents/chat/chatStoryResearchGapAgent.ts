/**
 * Story research gap agent (chat-origin story — extra Serp/scrape plan)
 *
 * Role:
 * After the message chat pipeline gathered evidence, decide whether the pending user story
 * still needs additional Serp calls, Firecrawl URLs, or YouTube fetches before synthesis.
 *
 * Called from:
 * - `inngest/chatstoryPipeline.ts` — `story-research-gap` step only
 *
 * Model: `CHAT_STORY_RESEARCH_GAP_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini`.
 * Structured output: optional Serp tool calls compatible with `ValidatedSerpToolCall`.
 *
 * Input: Counts and summaries of prepared research rows, Serp hits, YouTube evidence,
 * selected articles, plus story intent from upstream determiner snapshot.
 *
 * Output: `StoryResearchGapResult` — flags `needsAdditionalSerp`, planned tool calls,
 * optional `firecrawlUrls`, YouTube needs, with reasoning text for logs.
 *
 * Does not: re-run guardrails, query enhancer, or write final story copy (synthesizer does).
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { serpToolNameSchema } from "@/Agents/chat/smallDeterminerAgent";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import type { StoryResearchGapResult } from "@/services/chat/chatStoryPipelineTypes";
import { z } from "zod";

const serpToolInputModelSchema = z.object({
  q: z.string().nullable(),
  num: z.number().int().nullable(),
  gl: z.string().nullable(),
  hl: z.string().nullable(),
  location: z.string().nullable(),
  google_domain: z.string().nullable(),
  device: z.enum(["desktop", "tablet", "mobile"]).nullable(),
  topic_token: z.string().nullable(),
  publication_token: z.string().nullable(),
  section_token: z.string().nullable(),
  story_token: z.string().nullable(),
  kgmid: z.string().nullable(),
  no_cache: z.boolean().nullable(),
});

const plannedCallSchema = z.object({
  tool: serpToolNameSchema,
  input: serpToolInputModelSchema,
});

export const chatStoryResearchGapParamsSchema = z.object({
  enhancedPrompt: z.string().min(1),
  existingResearchCount: z.number().int().min(0),
  serpHitCount: z.number().int().min(0),
  youtubeEvidenceCount: z.number().int().min(0),
  selectedArticleCount: z.number().int().min(0),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type ChatStoryResearchGapParams = z.input<
  typeof chatStoryResearchGapParamsSchema
> & {
  abortSignal?: AbortSignal;
};

const modelOutputSchema = z.object({
  needsAdditionalSerp: z.boolean(),
  needsAdditionalYoutube: z.boolean(),
  useAiOverviewFollowUp: z.boolean(),
  firecrawlUrls: z.array(z.string()).max(5).nullable(),
  calls: z.array(plannedCallSchema).nullable(),
  reasoning: z.string().nullable(),
});

function resolveModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.CHAT_STORY_RESEARCH_GAP_MODEL,
  );
}

function buildSystemPrompt(): string {
  return [
    "You are a Story Research Gap agent for a single user-requested news story.",
    "",
    "Given prepared research from an earlier chat pipeline step, decide whether ADDITIONAL evidence is required before story synthesis.",
    "",
    "Do NOT repeat story-intent detection. The user already requested a story.",
    "Do NOT request research merely because tools exist.",
    "",
    "If existing research, Serp hits, selected articles, and YouTube evidence are sufficient for one evidence-backed story, set needsAdditionalSerp=false, needsAdditionalYoutube=false, calls=null, firecrawlUrls=null.",
    "",
    "If gaps remain (missing primary article evidence, stale facts, thin coverage), plan the smallest additional Serp/Firecrawl/YouTube work.",
    "",
    "Prefer searchGoogleNewsTab or searchGoogleNews for headlines; searchGoogle only when AI Overview follow-up is justified.",
    "List only URLs that still need Firecrawl in firecrawlUrls.",
    "",
    "Return strict JSON matching the schema.",
  ].join("\n");
}

function normalizeGapOutput(
  raw: z.infer<typeof modelOutputSchema>,
): StoryResearchGapResult {
  const firecrawlUrls = (raw.firecrawlUrls ?? []).filter((url) =>
    /^https?:\/\//i.test(url.trim()),
  );

  return {
    needsAdditionalSerp: raw.needsAdditionalSerp === true,
    serpCalls: raw.needsAdditionalSerp
      ? (raw.calls ?? []).map((call) => ({
          tool: call.tool,
          input: Object.fromEntries(
            Object.entries(call.input).filter(([, value]) => value != null),
          ),
        }))
      : [],
    needsAdditionalYoutube: raw.needsAdditionalYoutube === true,
    firecrawlUrls,
    useAiOverviewFollowUp: raw.useAiOverviewFollowUp === true,
    reasoning: raw.reasoning,
  };
}

async function runCore(
  params: ChatStoryResearchGapParams,
  generate: typeof aiClient.generate,
): Promise<StoryResearchGapResult> {
  const { abortSignal, ...rawParams } = params;
  const parsed = chatStoryResearchGapParamsSchema.parse(rawParams);
  const model = resolveModel(parsed.model);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.enhancedPrompt,
    extraContext: {
      existingResearchCount: parsed.existingResearchCount,
      serpHitCount: parsed.serpHitCount,
      youtubeEvidenceCount: parsed.youtubeEvidenceCount,
      selectedArticleCount: parsed.selectedArticleCount,
    },
    schemaName: "StoryResearchGap",
    schemaDescription:
      "Additional Serp/YouTube/Firecrawl work needed for one chat story.",
    output: modelOutputSchema,
    temperature: 0,
    maxOutputTokens: 1200,
    abortSignal,
  });

  return normalizeGapOutput(raw);
}

export function createChatStoryResearchGapAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);
  return (params: ChatStoryResearchGapParams) =>
    runCore(params, client.generate.bind(client));
}

export async function runChatStoryResearchGapAgent(
  params: ChatStoryResearchGapParams,
): Promise<StoryResearchGapResult> {
  return runCore(params, aiClient.generate.bind(aiClient));
}
