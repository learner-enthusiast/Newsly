/**
 * Research article selector agent
 *
 * What it does: Scores Serp link candidates against the user prompt, marks which
 * are relevant, ranks them, and returns the top share (topPercent) as scrape targets.
 * Used by the news pipeline and by the chat article synthesizer wrapper.
 *
 * Input: userPrompt; links (URL strings or objects with url, title, snippet,
 * source, sourceType); optional topPercent (default 50), model, system, abortSignal.
 *
 * Output: Array of { url, domain, title, sourceType } for relevant links only,
 * ordered by rank.
 */

import { aiClient, createAIClient, type AIClientOptions } from "@/clients/AIClient";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { z } from "zod";

const TRACKING_PARAMS = new Set([
  "fbclid",
  "gclid",
  "mc_cid",
  "mc_eid",
]);

const researchArticleLinkSchema = z.union([
  z.string().min(1),
  z.object({
    url: z.string().min(1),
    title: z.string().min(1).optional(),
    snippet: z.string().min(1).optional(),
    /** Publisher label from Serp (not the same as sourceType). */
    source: z.string().min(1).optional(),
    /** Serp channel / origin, e.g. google_news, google_search, google_search_ai_overview_follow_up. */
    sourceType: z.string().min(1).optional(),
    /** Rank boost for AI-overview follow-up hits (e.g. 1.4 = 40% higher priority). */
    selectionWeight: z.number().positive().optional(),
    /** True when this URL came from AI-overview follow-up Google search. */
    fromAiOverviewFollowUp: z.boolean().optional(),
  }),
]);

export const researchArticleSelectorParamsSchema = z.object({
  userPrompt: z.string().min(1),
  links: z.array(researchArticleLinkSchema).min(1),
  /** Share of relevant links to keep, from 1 to 100. Default 50. */
  topPercent: z.number().gt(0).max(100).default(50),
  model: z.string().min(1).optional(),
  system: z.string().min(1).optional(),
});

export type ResearchArticleSelectorParams = z.input<
  typeof researchArticleSelectorParamsSchema
> & {
  abortSignal?: AbortSignal;
};

/** Selected row shape aligned with `NewsSource` (before `newsStoryId` / scrape fields). */
export const selectedResearchArticleSchema = z.object({
  url: z.url(),
  domain: z.string().min(1),
  title: z.string().min(1),
  sourceType: z.string().min(1),
});

export type SelectedResearchArticle = z.infer<typeof selectedResearchArticleSchema>;

/** OpenAI structured outputs: every property must be required (no .optional()). */
const selectorModelOutputSchema = z.object({
  articles: z.array(
    z.object({
      url: z.string().min(1),
      relevant: z.boolean(),
      rank: z.number().int().min(1),
      reason: z.string().min(1).max(400),
    }),
  ),
});

type Candidate = {
  key: string;
  url: string;
  title?: string;
  snippet?: string;
  source?: string;
  sourceType?: string;
  selectionWeight?: number;
  fromAiOverviewFollowUp?: boolean;
};

type SelectorDecision = z.infer<typeof selectorModelOutputSchema>["articles"][number];

function resolveSelectorModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.RESEARCH_ARTICLE_SELECTOR_MODEL,
  );
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

function toCandidate(
  link: z.output<typeof researchArticleLinkSchema>,
): Omit<Candidate, "key"> | null {
  if (typeof link === "string") {
    const key = canonicalUrlKey(link);
    return key ? { url: key } : null;
  }

  const key = canonicalUrlKey(link.url);
  if (!key) {
    return null;
  }

  return {
    url: key,
    title: link.title,
    snippet: link.snippet,
    source: link.source,
    sourceType: link.sourceType,
    selectionWeight:
      typeof link === "object" && link.selectionWeight != null
        ? link.selectionWeight
        : undefined,
    fromAiOverviewFollowUp:
      typeof link === "object" && link.fromAiOverviewFollowUp === true
        ? true
        : undefined,
  };
}

function domainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return "unknown";
  }
}

function resolveSourceType(candidate: Candidate): string {
  return candidate.sourceType?.trim() || "web";
}

function resolveTitle(candidate: Candidate): string {
  const title = candidate.title?.trim();
  if (title) {
    return title;
  }
  return domainFromUrl(candidate.url);
}

/** Drop invalid URLs and keep the first copy of each canonical URL. */
export function dedupeArticleLinks(
  links: z.output<typeof researchArticleLinkSchema>[],
): Candidate[] {
  const seen = new Map<string, Candidate>();

  for (const link of links) {
    const candidate = toCandidate(link);
    if (!candidate) {
      continue;
    }
    const existing = seen.get(candidate.url);
    if (!existing) {
      seen.set(candidate.url, {
        ...candidate,
        key: candidate.url,
      });
      continue;
    }
    const preferNew =
      (candidate.fromAiOverviewFollowUp &&
        !existing.fromAiOverviewFollowUp) ||
      (candidate.selectionWeight ?? 1) > (existing.selectionWeight ?? 1);
    if (preferNew) {
      seen.set(candidate.url, {
        ...candidate,
        key: candidate.url,
      });
    }
  }

  return [...seen.values()];
}

function keepCount(relevantCount: number, topPercent: number): number {
  if (relevantCount === 0) {
    return 0;
  }

  return Math.ceil((relevantCount * topPercent) / 100);
}

function selectTopArticles(
  candidates: Candidate[],
  decisions: SelectorDecision[],
  topPercent: number,
): SelectedResearchArticle[] {
  const allowed = new Map(candidates.map((candidate) => [candidate.key, candidate]));
  const best = new Map<string, SelectorDecision>();

  for (const decision of decisions) {
    const key = canonicalUrlKey(decision.url);
    if (!key || !allowed.has(key) || !decision.relevant) {
      continue;
    }

    const existing = best.get(key);
    if (!existing || decision.rank < existing.rank) {
      best.set(key, decision);
    }
  }

  const ranked = [...best.entries()].sort(([leftKey, left], [rightKey, right]) => {
    const leftWeight = allowed.get(leftKey)?.selectionWeight ?? 1;
    const rightWeight = allowed.get(rightKey)?.selectionWeight ?? 1;
    return left.rank / leftWeight - right.rank / rightWeight;
  });
  const count = keepCount(ranked.length, topPercent);

  return selectedResearchArticleSchema.array().parse(
    ranked.slice(0, count).map(([key, decision]) => {
      const candidate = allowed.get(key)!;
      const url = candidate.url;
      return {
        url,
        domain: domainFromUrl(url),
        title: resolveTitle(candidate),
        sourceType: resolveSourceType(candidate),
      };
    }),
  );
}

function buildSystemPrompt(): string {
  return [
    "You choose which article URLs must be scraped with Firecrawl.",
    "The user prompt is the research question. Judge every candidate against that prompt.",
    "Return one decision for every candidate URL. Use the exact URL string given. Do not invent URLs.",
    "Set relevant to true only when the page is on-topic and a full Firecrawl scrape is needed to capture the article, announcement, filing, or primary report. A title or snippet is not enough.",
    "Set relevant to false for off-topic pages, homepages, section indexes, search pages, login walls, and link lists.",
    "rank 1 is the most important page to scrape. Give every candidate a rank.",
    "Candidates may include selectionWeight above 1 (for example 1.4). Treat them as higher priority: rank them higher when relevance is comparable.",
    "Candidates with fromAiOverviewFollowUp true or sourceType google_search_ai_overview_follow_up came from AI-overview follow-up searches; they are usually more aligned with current news — prefer them when relevance is similar.",
    "When relevant is true, reason is one concise sentence on why Firecrawl should scrape this URL: name the development, announcement, or reporting the full page is expected to contain.",
    "When relevant is false, reason is one short sentence on why the URL was dropped.",
  ].join("\n");
}

function outputTokenBudget(candidateCount: number): number {
  return Math.min(16000, Math.max(2048, candidateCount * 150));
}

async function runSelector(
  params: ResearchArticleSelectorParams,
  generate: typeof aiClient.generate,
): Promise<SelectedResearchArticle[]> {
  const { abortSignal, ...rawParams } = params;
  const parsed = researchArticleSelectorParamsSchema.parse(rawParams);
  const candidates = dedupeArticleLinks(parsed.links);

  if (candidates.length === 0) {
    throw new Error("No valid http(s) URLs to select from");
  }

  const model = resolveSelectorModel(parsed.model);
  const raw = await generate({
    model,
    system: parsed.system ?? buildSystemPrompt(),
    prompt: parsed.userPrompt,
    extraContext: {
      candidates: candidates.map(
        ({
          url,
          title,
          snippet,
          source,
          sourceType,
          selectionWeight,
          fromAiOverviewFollowUp,
        }) => ({
          url,
          title,
          snippet,
          source,
          sourceType,
          selectionWeight: selectionWeight ?? null,
          fromAiOverviewFollowUp: fromAiOverviewFollowUp ?? false,
        }),
      ),
    },
    schemaName: "ResearchArticleSelectorOutput",
    schemaDescription:
      "Per-URL relevance, rank, and why Firecrawl should scrape the page.",
    output: selectorModelOutputSchema,
    temperature: 0,
    maxOutputTokens: outputTokenBudget(candidates.length),
    abortSignal,
  });

  return selectTopArticles(candidates, raw.articles, parsed.topPercent);
}

export function createResearchArticleSelectorAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return function researchArticleSelectorAgent(
    params: ResearchArticleSelectorParams,
  ): Promise<SelectedResearchArticle[]> {
    return runSelector(params, client.generate.bind(client));
  };
}

/** Dedupe URLs, drop off-prompt links, and keep the top percent (default 50) to scrape. */
export async function runResearchArticleSelectorAgent(
  params: ResearchArticleSelectorParams,
): Promise<SelectedResearchArticle[]> {
  return runSelector(params, aiClient.generate.bind(aiClient));
}
