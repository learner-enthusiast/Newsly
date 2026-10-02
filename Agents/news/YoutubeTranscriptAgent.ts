/**
 * YouTube transcript news analysis agent (one video → structured facts)
 *
 * Role:
 * Parse a single video transcript under a research/briefing prompt; extract market/economy
 * facts **grounded in transcript text only**, rank importance, cluster events, and suggest
 * verification queries (not executed here).
 *
 * Called from:
 * - `analyzeYoutubeTranscriptsInParallel` in news/chat YouTube services
 * - Upstream of `YoutubeTranscriptSynthesizeAgent` in briefing and rerun pipelines
 *
 * Model: `YOUTUBE_TRANSCRIPT_AGENT_MODEL` → `NEWS_SYNTHESIZER_MODEL` → defaults.
 * Long transcripts use head+tail truncation (`boundedTranscriptForModel`, 80k chars).
 *
 * Input: `transcript`, `prompt`; optional `title`, `videoId`, `model`, `abortSignal`.
 *
 * Output: `YoutubeTranscriptAnalysis` — summary, importantFacts, majorEvents,
 * excludedTopics, overallImportance (exported Zod schema for downstream merge).
 *
 * Does not: fetch transcripts, browse the web, or write stories directly.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Max chars sent to the model in one transcript field (head + tail if longer). */
const TRANSCRIPT_MAX_CHARS = 80_000;
const TRANSCRIPT_HEAD_CHARS = 52_000;
const TRANSCRIPT_TAIL_CHARS = 26_000;

export const youtubeTranscriptFactTypeSchema = z.enum([
  "event",
  "market",
  "company",
  "economy",
  "policy",
  "regulation",
  "geopolitics",
  "commodity",
  "currency",
  "sector",
  "data",
  "statement",
  "other",
]);

export const youtubeTranscriptConfidenceSchema = z.enum([
  "high",
  "medium",
  "low",
]);

export const youtubeTranscriptFactSchema = z.object({
  fact: z.string().min(1).max(500),
  description: z.string().min(1).max(4_000),
  type: youtubeTranscriptFactTypeSchema,
  importance: z.number().int().min(1).max(10),
  confidence: youtubeTranscriptConfidenceSchema,
  entities: z.array(z.string().min(1).max(200)),
  eventDate: z.string().regex(ISO_DATE).nullable(),
  whyImportant: z.string().min(1).max(1_000),
  verificationQueries: z.array(z.string().min(3).max(400)).max(3),
});

export type YoutubeTranscriptFact = z.infer<typeof youtubeTranscriptFactSchema>;

export const youtubeTranscriptMajorEventSchema = z.object({
  title: z.string().min(1).max(300),
  description: z.string().min(1).max(4_000),
  importance: z.number().int().min(1).max(10),
  entities: z.array(z.string().min(1).max(200)),
  verificationQueries: z.array(z.string().min(3).max(400)).max(3),
});

export const youtubeTranscriptExcludedTopicSchema = z.object({
  topic: z.string().min(1).max(300),
  reason: z.string().min(1).max(500),
});

export const youtubeTranscriptAnalysisSchema = z.object({
  summary: z.string().min(1).max(8_000),
  importantFacts: z.array(youtubeTranscriptFactSchema).max(15),
  majorEvents: z.array(youtubeTranscriptMajorEventSchema).max(8),
  excludedTopics: z.array(youtubeTranscriptExcludedTopicSchema).max(10),
  overallImportance: z.number().int().min(1).max(10),
});

export type YoutubeTranscriptAnalysis = z.infer<
  typeof youtubeTranscriptAnalysisSchema
>;

export const youtubeTranscriptAgentParamsSchema = z.object({
  transcript: z.string().min(1).max(500_000),
  prompt: z.string().min(1).max(8_000),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type YoutubeTranscriptAgentParams = z.input<
  typeof youtubeTranscriptAgentParamsSchema
> & {
  abortSignal?: AbortSignal;
};

/** OpenAI structured outputs: required fields only (use null where needed). */
const youtubeTranscriptModelOutputSchema = z.object({
  summary: z.string().min(1).max(8_000),
  importantFacts: z
    .array(
      z.object({
        fact: z.string().min(1).max(500),
        description: z.string().min(1).max(4_000),
        type: youtubeTranscriptFactTypeSchema,
        importance: z.number().int().min(1).max(10),
        confidence: youtubeTranscriptConfidenceSchema,
        entities: z.array(z.string().min(1).max(200)),
        eventDate: z.string().nullable(),
        whyImportant: z.string().min(1).max(1_000),
        verificationQueries: z.array(z.string().min(3).max(400)).max(3),
      }),
    )
    .max(15),
  majorEvents: z
    .array(
      z.object({
        title: z.string().min(1).max(300),
        description: z.string().min(1).max(4_000),
        importance: z.number().int().min(1).max(10),
        entities: z.array(z.string().min(1).max(200)),
        verificationQueries: z.array(z.string().min(3).max(400)).max(3),
      }),
    )
    .max(8),
  excludedTopics: z
    .array(
      z.object({
        topic: z.string().min(1).max(300),
        reason: z.string().min(1).max(500),
      }),
    )
    .max(10),
  overallImportance: z.number().int().min(1).max(10),
});

function resolveYoutubeTranscriptModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.YOUTUBE_TRANSCRIPT_AGENT_MODEL ??
      process.env.NEWS_SYNTHESIZER_MODEL,
  );
}

/** Keeps start and end of very long transcripts so late segments are not dropped. */
export function boundedTranscriptForModel(transcript: string): string {
  const trimmed = transcript.trim();
  if (trimmed.length <= TRANSCRIPT_MAX_CHARS) {
    return trimmed;
  }
  const head = trimmed.slice(0, TRANSCRIPT_HEAD_CHARS);
  const tail = trimmed.slice(-TRANSCRIPT_TAIL_CHARS);
  const omitted = trimmed.length - TRANSCRIPT_HEAD_CHARS - TRANSCRIPT_TAIL_CHARS;
  return [
    head,
    `\n…[${omitted} characters omitted from middle of transcript]…\n`,
    tail,
  ].join("");
}

export function normalizeEventDateFromTranscript(
  value: string | null | undefined,
): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "null") {
    return null;
  }
  return ISO_DATE.test(trimmed) ? trimmed : null;
}

/** Sort facts/events by importance and normalize dates for public schema. */
export function normalizeYoutubeTranscriptAnalysis(
  raw: z.infer<typeof youtubeTranscriptModelOutputSchema>,
): YoutubeTranscriptAnalysis {
  const importantFacts = [...raw.importantFacts]
    .map((row) => ({
      ...row,
      eventDate: normalizeEventDateFromTranscript(row.eventDate),
    }))
    .sort((a, b) => b.importance - a.importance);

  const majorEvents = [...raw.majorEvents].sort(
    (a, b) => b.importance - a.importance,
  );

  return youtubeTranscriptAnalysisSchema.parse({
    summary: raw.summary.trim(),
    importantFacts,
    majorEvents,
    excludedTopics: raw.excludedTopics,
    overallImportance: raw.overallImportance,
  });
}

function buildSystemPrompt(): string {
  return [
    "You analyze YouTube transcripts for factual news, market, and economic developments.",
    "The transcript is your ONLY source of factual claims. Do not use outside knowledge.",
    "Do not verify claims, browse the web, or invent numbers, dates, names, or events.",
    "",
    "Distinguish explicit facts from opinion, speculation, and attributed uncertainty.",
    'If the speaker says "may" or "according to reports", preserve that uncertainty in fact and description.',
    "",
    "Importance (1–10) is relevance to the user task prompt, NOT confidence or airtime.",
    "Confidence (high/medium/low) is how clearly the transcript supports the fact.",
    "",
    "Prioritize: market moves, economic data, policy/regulation, corporate events,",
    "M&A, earnings, commodities, currencies, geopolitics, and material official statements.",
    "",
    "Do NOT treat stock tips, buy/sell calls, target prices, multibaggers, or watchlists as news facts.",
    "Put those in excludedTopics unless a separate underlying corporate/market event is stated — extract only the event.",
    "",
    "fact: concise headline. description: richer context (who, what, when, numbers, stated causes).",
    "whyImportant: relevance to the task prompt; no investment advice.",
    "entities: only names present in the transcript.",
    "eventDate: YYYY-MM-DD only when explicitly stated for that event; otherwise null.",
    "verificationQueries: up to 3 specific search strings for a later research step (include entities/dates).",
    "",
    "majorEvents: deduplicate related facts into distinct high-level developments; sort by importance.",
    "importantFacts: sort by descending importance.",
    "summary: concise, factual, prompt-relevant; no unsupported claims.",
    "",
    "Respond with JSON matching the schema only.",
  ].join("\n");
}

function outputTokenBudget(transcriptLength: number): number {
  return Math.min(16_000, Math.max(4_096, Math.floor(transcriptLength / 16) + 3_072));
}

async function runYoutubeTranscriptAnalysis(
  params: YoutubeTranscriptAgentParams,
  generate: typeof aiClient.generate,
): Promise<YoutubeTranscriptAnalysis & { model: string }> {
  const { abortSignal, ...rawParams } = params;
  const parsed = youtubeTranscriptAgentParamsSchema.parse(rawParams);
  const model = resolveYoutubeTranscriptModel(parsed.model);
  const transcriptForModel = boundedTranscriptForModel(parsed.transcript);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.prompt.trim(),
    extraContext: {
      transcript: transcriptForModel,
      transcriptCharCount: parsed.transcript.length,
      transcriptWasBounded: transcriptForModel.length < parsed.transcript.trim().length,
    },
    schemaName: "YoutubeTranscriptAnalysis",
    schemaDescription:
      "Factual news and market developments extracted from a YouTube transcript, with verification queries.",
    output: youtubeTranscriptModelOutputSchema,
    temperature: 0,
    maxOutputTokens: outputTokenBudget(transcriptForModel.length),
    abortSignal,
  });

  const analysis = normalizeYoutubeTranscriptAnalysis(raw);
  return { ...analysis, model };
}

export function createYoutubeTranscriptAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function youtubeTranscriptAgent(
    params: YoutubeTranscriptAgentParams,
  ): Promise<YoutubeTranscriptAnalysis & { model: string }> {
    return runYoutubeTranscriptAnalysis(params, client.generate.bind(client));
  };
}

/** Extract structured news facts from a YouTube transcript (transcript-only; no tools). */
export async function runYoutubeTranscriptAgent(
  params: YoutubeTranscriptAgentParams,
): Promise<YoutubeTranscriptAnalysis & { model: string }> {
  return runYoutubeTranscriptAnalysis(params, aiClient.generate.bind(aiClient));
}
