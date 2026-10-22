/**
 * researchBuilder — builds the FactSheet every later video agent relies on.
 *
 * 1. Stored source texts; missing full text fetched with Firecrawl (≤ 5 pages, cached).
 * 2. Fewer than 2 usable sources OR story older than 48h → 1–2 Google News
 *    searches, ≤ 3 new pages fetched (kept on the FactSheet as `search` sources).
 * 3. LLM extracts facts from those texts only, then a grounding pass drops any
 *    fact whose numbers or verbatim quote do not appear in its cited sources.
 */

import { createCallBudget, type CallBudget } from "@/clients/callTool";
import { runVideoAgent, type AgentResult } from "@/Agents/video/shared/agentResult";
import {
  defaultVideoGenerate,
  resolveVideoModel,
  type VideoGenerate,
} from "@/Agents/video/shared/llm";
import {
  extractNumbers,
  normaliseQuoteText,
  unsupportedNumbers,
} from "@/Agents/video/shared/numbers";
import { defaultVideoTools, type VideoTools } from "@/services/videoScript/videoTools";
import { PROMPT_VERSION, RESEARCH_BUILDER_SYSTEM_PROMPT } from "./prompt";
import {
  factExtractionSchema,
  factSheetSchema,
  researchBuilderInputSchema,
  type Fact,
  type FactExtraction,
  type FactSheet,
  type ResearchBuilderInput,
} from "./schema";

export { PROMPT_VERSION };
export * from "./schema";

export const MIN_USABLE_SOURCE_CHARS = 400;
export const MAX_STORED_SCRAPES = 5;
export const MAX_SEARCH_PAGES = 3;
export const STALE_STORY_HOURS = 48;
const MAX_CHARS_PER_SOURCE = 12_000;
/** Per-run cap on scrapes + searches (≤ 5 stored scrapes, ≤ 2 searches, ≤ 3 new pages). */
export const RESEARCH_CALL_BUDGET = 10;
const FINANCE_CATEGORY = /business|financ|market|econom|stock|bank|crypto|invest/i;

export type ResearchBuilderDeps = {
  generate?: VideoGenerate;
  tools?: VideoTools;
  /** External calls allowed for this run (scrapes + searches). */
  budget?: CallBudget;
  model?: string;
};

type WorkingSource = {
  id: string;
  url: string;
  title: string;
  text: string | null;
  origin: "story" | "stored" | "search";
};

function isUsable(text: string | null | undefined): text is string {
  return Boolean(text && text.trim().length >= MIN_USABLE_SOURCE_CHARS);
}

function isHttpUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

function storyAgeHours(input: { publishedAt: string | null; createdAt: string }, now: string) {
  const reference = Date.parse(input.publishedAt ?? input.createdAt);
  const current = Date.parse(now);
  if (!Number.isFinite(reference) || !Number.isFinite(current)) {
    return 0;
  }
  return (current - reference) / 3_600_000;
}

async function collectSources(
  input: ReturnType<typeof researchBuilderInputSchema.parse>,
  tools: VideoTools,
  budget: CallBudget,
): Promise<{ sources: WorkingSource[]; searchQueries: string[] }> {
  const stored: WorkingSource[] = input.sources.map((source) => ({
    id: source.id,
    url: source.url,
    title: source.title,
    text: isUsable(source.scrapedContent)
      ? source.scrapedContent
      : isUsable(source.transcript)
        ? source.transcript
        : null,
    origin: "stored",
  }));

  const missing = stored
    .filter((source) => !source.text && isHttpUrl(source.url))
    .slice(0, MAX_STORED_SCRAPES);
  await Promise.all(
    missing.map(async (source) => {
      const markdown = await tools.scrapeMarkdown(source.url, budget);
      if (isUsable(markdown)) {
        source.text = markdown;
      }
    }),
  );

  const usableCount = stored.filter((source) => source.text).length;
  const searchQueries: string[] = [];
  const found: WorkingSource[] = [];
  const ageHours = storyAgeHours(input.story, input.now);

  if (usableCount < 2 || ageHours > STALE_STORY_HOURS) {
    // Latest update for stale stories; background when sources are thin.
    const queries =
      ageHours > STALE_STORY_HOURS
        ? [`${input.story.title} latest`, ...(usableCount < 2 ? [input.story.title] : [])]
        : [input.story.title];
    const known = new Set(stored.map((source) => source.url));
    searchQueries.push(...queries);
    const hits = (await Promise.all(queries.map((q) => tools.searchNews(q, budget)))).flat();

    const fresh = hits
      .filter((hit, index) => !known.has(hit.url) && hits.findIndex((h) => h.url === hit.url) === index)
      .sort((a, b) => (Date.parse(b.isoDate ?? "") || 0) - (Date.parse(a.isoDate ?? "") || 0))
      .slice(0, MAX_SEARCH_PAGES);

    const scraped = await Promise.all(
      fresh.map(async (hit) => ({ hit, markdown: await tools.scrapeMarkdown(hit.url, budget) })),
    );
    scraped.forEach(({ hit, markdown }, index) => {
      if (isUsable(markdown)) {
        found.push({
          id: `search-${index + 1}`,
          url: hit.url,
          title: hit.title,
          text: markdown,
          origin: "search",
        });
      }
    });
  }

  const storyText = [
    input.story.title,
    input.story.description,
    input.story.summary,
    input.story.content,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    sources: [
      {
        id: "story",
        url: `/newsStory/${input.story.id}`,
        title: input.story.title,
        text: storyText,
        origin: "story",
      },
      ...stored,
      ...found,
    ],
    searchQueries,
  };
}

/**
 * Keeps only facts grounded in their cited texts: every number must appear in
 * a cited source and every quote must be verbatim. Re-numbers ids F1…Fn.
 */
export function groundFacts(
  extraction: FactExtraction,
  sources: Array<{ id: string; url: string; text: string | null; origin: string }>,
): { facts: Fact[]; conflicts: FactSheet["conflicts"]; dropped: FactSheet["droppedFacts"] } {
  const usable = sources.filter((s) => s.text);
  const byId = new Map(usable.map((s) => [s.id, s]));
  const numbersById = new Map(usable.map((s) => [s.id, extractNumbers(s.text!)]));
  const quoteTextById = new Map(usable.map((s) => [s.id, normaliseQuoteText(s.text!)]));
  const keptIdByPosition = new Map<number, string>();
  const facts: Fact[] = [];
  const dropped: FactSheet["droppedFacts"] = [];

  extraction.facts.forEach((raw, index) => {
    const sourceIds = [...new Set(raw.sourceIds)].filter((id) => byId.has(id));
    if (sourceIds.length === 0 || !raw.text.trim()) {
      dropped.push({ text: raw.text, reason: "cites no known source" });
      return;
    }

    // A number missing from the cited texts may still be in another source:
    // cite that source too (mis-citation), otherwise the fact is ungrounded.
    const claimText = `${raw.text} ${raw.value ?? ""}`;
    let failure: string | null = null;
    for (const token of extractNumbers(claimText)) {
      const cites = (id: string) =>
        unsupportedNumbers(token.raw, numbersById.get(id) ?? []).length === 0;
      if (sourceIds.some(cites)) {
        continue;
      }
      const other = usable.find((source) => cites(source.id));
      if (!other) {
        failure = `number "${token.raw}" is in no source`;
        break;
      }
      sourceIds.push(other.id);
    }
    if (!failure && raw.type === "quote") {
      const quote = raw.value ? normaliseQuoteText(raw.value) : "";
      const has = (id: string) => Boolean(quote) && (quoteTextById.get(id) ?? "").includes(quote);
      if (!sourceIds.some(has)) {
        const other = usable.find((source) => has(source.id));
        if (other) {
          sourceIds.push(other.id);
        } else {
          failure = "quote is not verbatim in any source";
        }
      }
    }
    if (failure) {
      dropped.push({ text: raw.text, reason: failure });
      return;
    }

    const id = `F${facts.length + 1}`;
    keptIdByPosition.set(index + 1, id);
    facts.push({
      id,
      text: raw.text.trim(),
      type: raw.type,
      ...(raw.value?.trim() ? { value: raw.value.trim() } : {}),
      ...(raw.type === "quote" && raw.speaker?.trim() ? { speaker: raw.speaker.trim() } : {}),
      sourceIds,
      sourceUrls: sourceIds
        .map((sourceId) => byId.get(sourceId))
        .filter((source) => source && source.origin !== "story")
        .map((source) => source!.url),
      confidence: raw.confidence,
    });
  });

  const conflicts = extraction.conflicts.flatMap((conflict) => {
    const factA = keptIdByPosition.get(conflict.factA);
    const factB = keptIdByPosition.get(conflict.factB);
    return factA && factB && factA !== factB ? [{ factA, factB, note: conflict.note }] : [];
  });

  return { facts, conflicts, dropped };
}

export function createResearchBuilder(deps: ResearchBuilderDeps = {}) {
  const generate = deps.generate ?? defaultVideoGenerate;
  const tools = deps.tools ?? defaultVideoTools;

  return async function researchBuilder(
    rawInput: ResearchBuilderInput,
  ): Promise<AgentResult<FactSheet>> {
    return runVideoAgent(
      "researchBuilder",
      { input: researchBuilderInputSchema, output: factSheetSchema },
      rawInput,
      async (input) => {
        const budget = deps.budget ?? createCallBudget(RESEARCH_CALL_BUDGET);
        const { sources, searchQueries } = await collectSources(input, tools, budget);
        const usable = sources.filter((source) => source.text);

        const extraction = await generate({
          model: resolveVideoModel(deps.model),
          system: RESEARCH_BUILDER_SYSTEM_PROMPT,
          prompt: `Build the fact sheet for this story: ${input.story.title}`,
          extraContext: {
            story: {
              category: input.story.category,
              location: input.story.location,
              publishedAt: input.story.publishedAt,
            },
            sources: usable.map((source) => ({
              id: source.id,
              title: source.title,
              url: source.origin === "story" ? null : source.url,
              text: source.text!.slice(0, MAX_CHARS_PER_SOURCE),
            })),
          },
          schemaName: "VideoFactSheet",
          schemaDescription: "Grounded facts extracted from the provided texts only.",
          output: factExtractionSchema,
          temperature: 0,
          maxOutputTokens: 8_000,
        });

        const { facts, conflicts, dropped } = groundFacts(extraction, usable);
        if (facts.length === 0) {
          throw new Error("no facts could be grounded in the sources");
        }

        return {
          facts,
          whatHappened: extraction.whatHappened.trim() || input.story.summary,
          whatChanged: extraction.whatChanged.trim(),
          whyItMatters: extraction.whyItMatters,
          whoIsAffected: extraction.whoIsAffected,
          openQuestions: extraction.openQuestions,
          conflicts,
          isFinance: extraction.isFinance || FINANCE_CATEGORY.test(input.story.category),
          sources: usable.map(({ id, url, title, origin }) => ({ id, url, title, origin })),
          searchQueries,
          droppedUngroundedFacts: dropped.length,
          droppedFacts: dropped,
        };
      },
    );
  };
}

export const runResearchBuilder = createResearchBuilder();
