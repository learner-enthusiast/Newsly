/**
 * Relevance agent (Serp URL picker for chat)
 *
 * Role:
 * Given normalized or raw Serp payloads, choose which URLs merit a Firecrawl scrape for the
 * user’s research question. Returns structured picks with short justifications.
 *
 * Called from:
 * - Chat Serp research helpers (alongside or instead of full article selector on some paths)
 * - Distinct from `ResearchArticleSelectorAgent` (news briefing uses selector + budgets)
 *
 * Model: `RELEVANCE_AGENT_MODEL` → `OPENAI_MODEL` → `gpt-4o-mini`.
 *
 * Input:
 * - `userQuery` — enhanced research prompt
 * - `searchResults` — flat hits or nested engine JSON (organic/news/references keys)
 * - Optional `limit` (default 10), `model`, `system`, `abortSignal`
 *
 * Output: `{ selected: [{ id, url, reason }] }` — canonical URLs, deduped tracking params.
 *
 * Does not: answer the user, rewrite the query, or fetch page bodies.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const TRACKING_PARAMS = new Set(["fbclid", "gclid", "mc_cid", "mc_eid"]);
const NESTED_RESULT_KEYS = ["organic_results", "news_results", "references", "stories"] as const;

export const relevanceAgentParamsSchema = z.object({
  /** Enhanced user query. Used only to judge which results are worth scraping. */
  userQuery: z.string().min(1),
  /** Flat Serp rows, or raw engine payloads that contain organic/news/reference lists. */
  searchResults: z.array(z.unknown()),
  /** Max URLs to keep for Firecrawl. Default 10. Lower or raise it per query. */
  limit: z.number().int().min(1).max(30).default(10),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type RelevanceAgentParams = z.input<typeof relevanceAgentParamsSchema> & {
  abortSignal?: AbortSignal;
};

export const relevanceSelectedResultSchema = z.object({
  id: z.string().min(1),
  url: z.url(),
  reason: z.string().min(1).max(400),
});

export const relevanceSelectionSchema = z.object({
  selected: z.array(relevanceSelectedResultSchema),
});

export type RelevanceSelectedResult = z.infer<typeof relevanceSelectedResultSchema>;
export type RelevanceSelection = z.infer<typeof relevanceSelectionSchema>;

/** OpenAI structured outputs: every property must be required (no .optional()). */
const relevanceModelOutputSchema = z.object({
  selected: z.array(
    z.object({
      id: z.string().min(1),
      url: z.string().min(1),
      reason: z.string().min(1).max(400),
    }),
  ),
});

type SearchCandidate = {
  id: string;
  /** Original URL from the Serp row. Never rewritten. */
  url: string;
  key: string;
  title: string | null;
  snippet: string | null;
  source: string | null;
  date: string | null;
  engine: string | null;
};

type ModelPick = z.infer<typeof relevanceModelOutputSchema>["selected"][number];

function resolveRelevanceModel(override?: string): string {
  return resolveOpenAiModelId(override, process.env.RELEVANCE_AGENT_MODEL);
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function canonicalUrlKey(raw: string): string | null {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }

    url.hash = "";
    url.hostname = url.hostname.toLowerCase();

    const queryKeys = Array.from(url.searchParams.keys());
    for (const key of queryKeys) {
      const normalized = key.toLowerCase();
      if (normalized.startsWith("utm_") || TRACKING_PARAMS.has(normalized)) {
        url.searchParams.delete(key);
      }
    }

    if (url.pathname.length > 1 && url.pathname.endsWith("/")) {
      url.pathname = url.pathname.slice(0, -1);
    }

    url.searchParams.sort();
    return url.toString();
  } catch {
    return null;
  }
}

function readUrl(record: Record<string, unknown>): string | null {
  return readString(record, "link") ?? readString(record, "url");
}

function readSource(record: Record<string, unknown>): string | null {
  const source = record.source;
  if (typeof source === "string") {
    return source.trim() || null;
  }
  const sourceRecord = asRecord(source);
  if (!sourceRecord) {
    return null;
  }
  return readString(sourceRecord, "name");
}

function readDate(record: Record<string, unknown>): string | null {
  return (
    readString(record, "iso_date") ??
    readString(record, "published_at") ??
    readString(record, "date")
  );
}

function readEngine(
  record: Record<string, unknown>,
  inherited: string | null,
): string | null {
  const direct = readString(record, "engine") ?? readString(record, "sourceType");
  if (direct) {
    return direct;
  }

  const metadata = asRecord(record.search_metadata);
  const fromMetadata = metadata ? readString(metadata, "engine") : null;
  return fromMetadata ?? inherited;
}

function snippetForPrompt(snippet: string | null, candidateCount: number): string | null {
  if (!snippet) {
    return null;
  }
  const max = candidateCount > 80 ? 240 : 500;
  if (snippet.length <= max) {
    return snippet;
  }
  return `${snippet.slice(0, max)}…`;
}

/**
 * Flatten mixed Serp payloads, drop rows without an http(s) URL, and keep the
 * first copy of each article. Missing ids become `serp-0`, `serp-1`, ...
 */
export function collectSearchCandidates(searchResults: unknown[]): SearchCandidate[] {
  const byUrl = new Map<string, SearchCandidate>();
  const usedIds = new Set<string>();
  let generated = 0;

  function nextGeneratedId(): string {
    let id = `serp-${generated}`;
    while (usedIds.has(id)) {
      generated += 1;
      id = `serp-${generated}`;
    }
    generated += 1;
    usedIds.add(id);
    return id;
  }

  function addRow(record: Record<string, unknown>, inheritedEngine: string | null) {
    const url = readUrl(record);
    if (!url) {
      return;
    }

    const key = canonicalUrlKey(url);
    if (!key || byUrl.has(key)) {
      return;
    }

    const providedId = readString(record, "id");
    const id = providedId && !usedIds.has(providedId) ? providedId : nextGeneratedId();
    if (providedId && id === providedId) {
      usedIds.add(id);
    }

    byUrl.set(key, {
      id,
      url,
      key,
      title: readString(record, "title"),
      snippet: readString(record, "snippet"),
      source: readSource(record),
      date: readDate(record),
      engine: readEngine(record, inheritedEngine),
    });
  }

  function walk(value: unknown, inheritedEngine: string | null) {
    const record = asRecord(value);
    if (!record) {
      return;
    }

    const engine = readEngine(record, inheritedEngine);
    addRow(record, engine);

    const highlight = asRecord(record.highlight);
    if (highlight) {
      walk(highlight, engine);
    }

    for (const key of NESTED_RESULT_KEYS) {
      const nested = record[key];
      if (!Array.isArray(nested)) {
        continue;
      }
      for (const child of nested) {
        walk(child, engine);
      }
    }
  }

  for (const result of searchResults) {
    walk(result, null);
  }

  return [...byUrl.values()];
}

function applySelection(
  candidates: SearchCandidate[],
  picks: ModelPick[],
  limit: number,
): RelevanceSelection {
  const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
  const selected: RelevanceSelectedResult[] = [];
  const used = new Set<string>();

  for (const pick of picks) {
    const candidate = byId.get(pick.id);
    const reason = pick.reason.trim();
    if (!candidate || used.has(candidate.id) || reason.length === 0) {
      continue;
    }

    const parsed = relevanceSelectedResultSchema.safeParse({
      id: candidate.id,
      url: candidate.url,
      reason,
    });
    if (!parsed.success) {
      continue;
    }

    used.add(candidate.id);
    selected.push(parsed.data);

    if (selected.length >= limit) {
      break;
    }
  }

  return relevanceSelectionSchema.parse({ selected });
}

function buildSystemPrompt(limit: number): string {
  return [
    "You are a pre-Firecrawl relevance filter for a financial research product.",
    "You do not answer the user's question. You do not summarize articles. You do not scrape pages.",
    "You only decide which result URLs are worth spending Firecrawl credits on.",
    "Judge each result from its metadata and snippet only. Do not infer the contents of a page from its URL.",
    "Do not fabricate facts that are not in the result metadata.",
    "Do not select a result only because its title contains a keyword.",
    "",
    "Prefer results that:",
    "- directly address the user query",
    "- have a relevant title and snippet",
    "- come from a primary or authoritative source when that is clear from the metadata",
    "- are recent when the query is time-sensitive",
    "- for financial questions, come from relevant finance or news results and authoritative market sources",
    "",
    `Return at most ${limit} results, best first.`,
    "If fewer results are genuinely worth scraping, return only those. Do not pad the list.",
    "Use each candidate id and url exactly as given. Do not invent ids or urls.",
    "reason is one short sentence explaining why this result is worth scraping.",
  ].join("\n");
}

function outputTokenBudget(limit: number): number {
  return Math.min(4096, Math.max(800, limit * 150));
}

async function runRelevanceCore(
  params: RelevanceAgentParams,
  generate: typeof aiClient.generate,
): Promise<RelevanceSelection> {
  const { abortSignal, ...rawParams } = params;
  const parsed = relevanceAgentParamsSchema.parse(rawParams);
  const candidates = collectSearchCandidates(parsed.searchResults);

  if (candidates.length === 0) {
    return { selected: [] };
  }

  const model = resolveRelevanceModel(parsed.model);
  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(parsed.limit),
    prompt: parsed.userQuery.trim(),
    extraContext: {
      limit: parsed.limit,
      candidates: candidates.map((candidate) => ({
        id: candidate.id,
        url: candidate.url,
        title: candidate.title,
        snippet: snippetForPrompt(candidate.snippet, candidates.length),
        source: candidate.source,
        date: candidate.date,
        engine: candidate.engine,
      })),
    },
    schemaName: "RelevanceAgentOutput",
    schemaDescription:
      "URLs worth scraping with Firecrawl, chosen from the provided search results only.",
    output: relevanceModelOutputSchema,
    temperature: 0,
    maxOutputTokens: outputTokenBudget(parsed.limit),
    abortSignal,
  });

  return applySelection(candidates, raw.selected, parsed.limit);
}

export function createRelevanceAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function relevanceAgent(params: RelevanceAgentParams): Promise<RelevanceSelection> {
    return runRelevanceCore(params, client.generate.bind(client));
  };
}

/** Choose which Serp URLs are worth a Firecrawl scrape. Does not answer the query. */
export async function runRelevanceAgent(
  params: RelevanceAgentParams,
): Promise<RelevanceSelection> {
  return runRelevanceCore(params, aiClient.generate.bind(aiClient));
}
