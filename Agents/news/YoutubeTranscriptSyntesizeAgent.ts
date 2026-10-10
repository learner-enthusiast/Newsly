/**
 * YouTube transcript synthesis agent (multi-video → synthesizer facts)
 *
 * Role:
 * Merge per-video `YoutubeTranscriptAgent` analyses into a single bundle of at most 10
 * weighted facts plus a short overview for `NewsSynthesizerAgent`. YouTube remains
 * **supporting** evidence — stories still need primary article sources in pipelines.
 *
 * Called from:
 * - `inngest/newsPipeline.ts` — `synthesize-youtube-transcript-facts`
 * - `inngest/reRunPipeline.ts` — inside `research-new-evidence`
 *
 * Model: `YOUTUBE_TRANSCRIPT_SYNTHESIZE_MODEL` → `YOUTUBE_TRANSCRIPT_AGENT_MODEL` → defaults.
 * Sends compact analysis summaries (`compactAnalysesForSynthesis`), not raw transcripts again.
 *
 * Input: `prompt`; `analyses[]` — `{ videoId, title, analysis }` per selected video.
 *
 * Output: `{ facts[], overview, model }` — facts include weight 1–100 and `detailedContext`.
 *
 * Does not: download transcripts or cluster final news stories.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import {
  youtubeTranscriptAnalysisSchema,
  type YoutubeTranscriptAnalysis,
} from "@/Agents/news/YoutubeTranscriptAgent";
import { z } from "zod";

export const youtubeTranscriptAnalysisInputSchema = z.object({
  videoId: z.string().min(1),
  title: z.string().nullable(),
  analysis: youtubeTranscriptAnalysisSchema,
});

export const youtubeTranscriptSynthesizeParamsSchema = z.object({
  prompt: z.string().min(1).max(8_000),
  analyses: z.array(youtubeTranscriptAnalysisInputSchema).max(8),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type YoutubeTranscriptSynthesizeParams = z.input<
  typeof youtubeTranscriptSynthesizeParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const synthesizedTranscriptFactSchema = z.object({
  fact: z.string().min(1).max(500),
  detailedContext: z.string().min(1).max(4_000),
  weight: z.number().int().min(1).max(100),
  videoId: z.string().min(1),
  sourceTitle: z.string().nullable(),
  importance: z.number().int().min(1).max(10),
});

export const youtubeTranscriptSynthesisSchema = z.object({
  facts: z.array(synthesizedTranscriptFactSchema).max(10),
  overview: z.string().min(1).max(2_000),
});

export type SynthesizedTranscriptFact = z.infer<typeof synthesizedTranscriptFactSchema>;
export type YoutubeTranscriptSynthesis = z.infer<typeof youtubeTranscriptSynthesisSchema>;

const modelOutputSchema = z.object({
  facts: z
    .array(
      z.object({
        fact: z.string().min(1).max(500),
        detailedContext: z.string().min(1).max(4_000),
        weight: z.number().int().min(1).max(100),
        videoId: z.string().min(1),
        sourceTitle: z.string().nullable(),
        importance: z.number().int().min(1).max(10),
      }),
    )
    .max(10),
  overview: z.string().min(1).max(2_000),
});

function resolveModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.YOUTUBE_TRANSCRIPT_SYNTHESIZE_MODEL ??
      process.env.YOUTUBE_TRANSCRIPT_AGENT_MODEL,
  );
}

/** Flatten analyses for the model without sending full transcript text again. */
export function compactAnalysesForSynthesis(
  analyses: z.infer<typeof youtubeTranscriptAnalysisInputSchema>[],
): unknown[] {
  return analyses.map(({ videoId, title, analysis }) => ({
    videoId,
    title,
    summary: analysis.summary,
    overallImportance: analysis.overallImportance,
    importantFacts: analysis.importantFacts.map((row) => ({
      fact: row.fact,
      description: row.description,
      type: row.type,
      importance: row.importance,
      confidence: row.confidence,
      entities: row.entities,
      eventDate: row.eventDate,
      whyImportant: row.whyImportant,
    })),
    majorEvents: analysis.majorEvents.map((row) => ({
      title: row.title,
      description: row.description,
      importance: row.importance,
      entities: row.entities,
    })),
  }));
}

export function normalizeYoutubeTranscriptSynthesis(
  raw: z.infer<typeof modelOutputSchema>,
  allowedVideoIds: Set<string>,
): YoutubeTranscriptSynthesis {
  const seen = new Set<string>();
  const facts: SynthesizedTranscriptFact[] = [];

  const sorted = [...raw.facts].sort(
    (left, right) => right.weight - left.weight || right.importance - left.importance,
  );

  for (const row of sorted) {
    const videoId = row.videoId.trim();
    if (!allowedVideoIds.has(videoId) || seen.has(`${videoId}:${row.fact}`)) {
      continue;
    }
    seen.add(`${videoId}:${row.fact}`);
    facts.push({
      fact: row.fact.trim(),
      detailedContext: row.detailedContext.trim(),
      weight: row.weight,
      videoId,
      sourceTitle: row.sourceTitle?.trim() || null,
      importance: row.importance,
    });
    if (facts.length >= 10) {
      break;
    }
  }

  return youtubeTranscriptSynthesisSchema.parse({
    facts,
    overview: raw.overview.trim(),
  });
}

function buildSystemPrompt(): string {
  return [
    "You consolidate YouTube transcript analyses into at most 10 facts for a daily news synthesizer.",
    "Input is structured facts/events already extracted from transcripts — do not invent new claims.",
    "Pick the most newsworthy, non-duplicative developments for the user's prompt.",
    "Exclude stock tips, buy/sell calls, and pure trading advice unless a distinct corporate/market event is stated.",
    "Each fact needs:",
    "- fact: concise headline",
    "- detailedContext: rich paragraphs (who, what, when, numbers, stated causes) for story writing",
    "- weight: 1–100; higher means the news synthesizer should treat this as stronger evidence (top facts often 75–100)",
    "- videoId: must match input",
    "- sourceTitle: video title or null",
    "- importance: 1–10 from the source analyses, adjusted for prompt relevance",
    "Return fewer than 10 when duplicates or weak items remain. Never exceed 10.",
    "overview: short synthesis of how these YouTube facts relate to the prompt (for the news synthesizer).",
  ].join("\n");
}

async function runCore(
  params: YoutubeTranscriptSynthesizeParams,
  generate: typeof aiClient.generate,
): Promise<YoutubeTranscriptSynthesis & { model: string }> {
  const { abortSignal, ...rawParams } = params;
  const parsed = youtubeTranscriptSynthesizeParamsSchema.parse(rawParams);

  if (parsed.analyses.length === 0) {
    return {
      facts: [],
      overview: "No YouTube transcript analyses were provided.",
      model: resolveModel(parsed.model),
    };
  }

  const allowedVideoIds = new Set(parsed.analyses.map((row) => row.videoId));
  const model = resolveModel(parsed.model);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.prompt.trim(),
    extraContext: {
      analyses: compactAnalysesForSynthesis(parsed.analyses),
    },
    schemaName: "YoutubeTranscriptSynthesis",
    schemaDescription:
      "Up to 10 weighted YouTube-derived facts with detailed context for news story clustering.",
    output: modelOutputSchema,
    temperature: 0,
    maxOutputTokens: 8192,
    abortSignal,
  });

  const synthesis = normalizeYoutubeTranscriptSynthesis(raw, allowedVideoIds);
  return { ...synthesis, model };
}

export function createYoutubeTranscriptSynthesizeAgent(
  options: AIClientOptions = {},
) {
  const client = createAIClient(options);
  return (params: YoutubeTranscriptSynthesizeParams) =>
    runCore(params, client.generate.bind(client));
}

export async function runYoutubeTranscriptSynthesizeAgent(
  params: YoutubeTranscriptSynthesizeParams,
): Promise<YoutubeTranscriptSynthesis & { model: string }> {
  return runCore(params, aiClient.generate.bind(aiClient));
}

export type YoutubeTranscriptAnalysisBundle = {
  videoId: string;
  title: string | null;
  analysis: YoutubeTranscriptAnalysis;
};
