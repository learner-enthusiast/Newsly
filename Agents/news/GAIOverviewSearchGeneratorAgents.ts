/**
 * Google AI Overview search query generator agent
 *
 * Role:
 * When Serp returns a Google AI Overview block on the initial news search pass, generate
 * 3–4 diverse follow-up **web news tab** queries to deepen coverage beyond overview snippets.
 *
 * Called from:
 * - `services/news/newsSerpDiscovery.ts` — whenever merged Google search Serp returns
 *   an AI Overview (initial briefing and rerun discovery share this path)
 *
 * Model: `GAI_OVERVIEW_SEARCH_MODEL` → `NEWS_SYNTHESIZER_MODEL` → defaults.
 *
 * Input: `aiOverviewText` (≤50k chars); optional `date`, `location`, `scope` (`local`|`world`).
 *
 * Output: `{ queries: string[] }` — 3–4 distinct Google-search-ready strings.
 *
 * Does not: execute Serp itself; pipeline fetches each query via `searchGoogle` news tab.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

export const gaiOverviewSearchGeneratorParamsSchema = z.object({
  /** Plain-text or markdown extracted from Google AI Overview. */
  aiOverviewText: z.string().min(1).max(50_000),
  /** News request date for time-bounded queries when helpful. */
  date: isoDateSchema.optional(),
  location: z.string().min(1).optional(),
  scope: z.enum(["local", "world"]).optional(),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type GaiOverviewSearchGeneratorParams = z.input<
  typeof gaiOverviewSearchGeneratorParamsSchema
> & {
  abortSignal?: AbortSignal;
};

export const gaiOverviewSearchQuerySchema = z.object({
  query: z.string().min(3).max(400),
  /** Short note on what this search is meant to verify or expand. */
  rationale: z.string().min(1).max(300),
});

export const gaiOverviewSearchGeneratorOutputSchema = z.object({
  queries: z.array(gaiOverviewSearchQuerySchema).min(3).max(4),
});

export type GaiOverviewSearchGeneratorOutput = z.infer<
  typeof gaiOverviewSearchGeneratorOutputSchema
>;

const gaiOverviewSearchGeneratorModelOutputSchema = z.object({
  queries: z
    .array(
      z.object({
        query: z.string().min(3).max(400),
        rationale: z.string().min(1).max(300),
      }),
    )
    .min(3)
    .max(4),
});

function resolveGaiOverviewSearchGeneratorModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.GAI_OVERVIEW_SEARCH_MODEL ?? process.env.NEWS_SYNTHESIZER_MODEL,
  );
}

function buildSystemPrompt(): string {
  return [
    "You generate follow-up Google search queries for a daily stock-market and economic news pipeline.",
    "You receive text from Google AI Overview summarizing what is happening in markets, companies, and the economy.",
    "",
    "Produce exactly 3 or 4 distinct search queries that would help a researcher find authoritative articles about the same news.",
    "Each query should target a different angle: e.g. a named company, a policy or macro event, a sector, or a specific claim that needs verification.",
    "Prefer concrete entities (companies, indices, regulators, countries) and recent news phrasing over vague questions.",
    "Do not repeat the same entity with minor wording changes. Do not output generic queries unrelated to the overview text.",
    "Queries must be suitable for Google web search (no site: operators unless clearly justified).",
    "Stay within financial, business, and economic news — not lifestyle or unrelated topics.",
    "Respond with JSON matching the schema only.",
  ].join("\n");
}

function buildUserPrompt(params: z.infer<typeof gaiOverviewSearchGeneratorParamsSchema>): string {
  const lines = [
    "Generate 3–4 Google search queries based on this AI Overview text.",
    "",
    "## AI Overview",
    params.aiOverviewText.trim(),
  ];

  if (params.date || params.location || params.scope) {
    lines.push("", "## News request context");
    if (params.date) {
      lines.push(`Date: ${params.date}`);
    }
    if (params.scope) {
      lines.push(`Scope: ${params.scope}`);
    }
    if (params.location) {
      lines.push(`Location: ${params.location}`);
    }
  }

  return lines.join("\n");
}

async function runGaiOverviewSearchGenerator(
  params: GaiOverviewSearchGeneratorParams,
  generate: typeof aiClient.generate,
): Promise<GaiOverviewSearchGeneratorOutput & { model: string }> {
  const { abortSignal, ...rawParams } = params;
  const parsed = gaiOverviewSearchGeneratorParamsSchema.parse(rawParams);
  const model = resolveGaiOverviewSearchGeneratorModel(parsed.model);

  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: buildUserPrompt(parsed),
    schemaName: "GaiOverviewSearchGeneratorOutput",
    schemaDescription:
      "Three or four distinct Google search queries to research AI Overview daily news further.",
    output: gaiOverviewSearchGeneratorModelOutputSchema,
    temperature: 0.2,
    maxOutputTokens: 1024,
    abortSignal,
  });

  const output = gaiOverviewSearchGeneratorOutputSchema.parse(raw);
  return { ...output, model };
}

export function createGaiOverviewSearchGeneratorAgent(
  options: AIClientOptions = {},
) {
  const client = createAIClient(options);

  return function gaiOverviewSearchGeneratorAgent(
    params: GaiOverviewSearchGeneratorParams,
  ): Promise<GaiOverviewSearchGeneratorOutput & { model: string }> {
    return runGaiOverviewSearchGenerator(params, client.generate.bind(client));
  };
}

/** Generate 3–4 follow-up Google queries from AI Overview text. */
export async function runGaiOverviewSearchGeneratorAgent(
  params: GaiOverviewSearchGeneratorParams,
): Promise<GaiOverviewSearchGeneratorOutput & { model: string }> {
  return runGaiOverviewSearchGenerator(params, aiClient.generate.bind(aiClient));
}
