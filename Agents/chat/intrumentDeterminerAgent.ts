/**
 * Instrument determiner agent (chat / deep-dive / chat-story pipelines)
 *
 * Role:
 * Decide whether an enhanced research prompt is about specific listed instruments
 * (stocks, indices, ETFs). When it is, resolve them against the `instruments`
 * table and choose which Upstox APIs are worth calling for the question.
 *
 * Flow (two LLM calls, DB lookups in parallel between them):
 * 1. extract — is it instrument-specific? title + up to 3 entities with search terms.
 *    Generic market/economy questions return `isAboutSpecificInstrument=false` and stop.
 * 2. lookup — `searchInstrumentsByNameOrShortName` per search term × segment, plus
 *    exact `findInstrumentsByTradingSymbol` for symbol guesses, all in parallel.
 * 3. match-and-plan — pick the best candidate per entity (by index, so it cannot
 *    invent keys) and one set of Upstox tool flags for the question.
 *
 * Model: `INSTRUMENT_DETERMINER_MODEL` → `DETERMINER_MODEL` → `OPENAI_MODEL` → default.
 *
 * Does not call Upstox — see `services/chat/instrumentResearch.ts`.
 */

import {
  aiClient,
  createAIClient,
  type AIClientOptions,
} from "@/clients/AIClient";
import {
  normalizeStockResearchInstrument,
  type StockResearchInstrument,
  type UpstoxToolFlags,
  UPSTOX_DETERMINER_TOOL_KEYS,
} from "@/Agents/stockResearch/toolDeterminerAgent";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import {
  findInstrumentsByTradingSymbol,
  searchInstrumentsByNameOrShortName,
} from "@/repositories/instrument";
import { toJsonSafeStepOutput } from "@/services/news/normalizeArticles";
import { upstoxApis } from "@/services/upstox/index";
import { z } from "zod";

const MAX_ENTITIES = 3;
const MAX_SEARCH_TERMS = 2;
const CANDIDATES_PER_QUERY = 6;
const MAX_CANDIDATES_PER_ENTITY = 12;

/**
 * Upstox tools the chat path may call. Excludes streaming, order-shaped calls,
 * and option analytics that need a specific expiry the chat prompt rarely gives.
 */
export const CHAT_UPSTOX_TOOL_KEYS = [
  "getFullMarketQuotes",
  "getOhlcQuotes",
  "getHistoricalCandles",
  "getIntradayCandles",
  "getCompanyProfile",
  "getKeyRatios",
  "getShareHoldings",
  "getIncomeStatement",
  "getBalanceSheet",
  "getCashFlow",
  "getCorporateActions",
  "getCompetitors",
  "getInstrumentNews",
  "getFiiData",
  "getDiiData",
] as const satisfies readonly (typeof UPSTOX_DETERMINER_TOOL_KEYS)[number][];

export type ChatUpstoxToolKey = (typeof CHAT_UPSTOX_TOOL_KEYS)[number];

/** Market-wide tools: call once per run, not once per instrument. */
export const MARKET_WIDE_TOOL_KEYS = new Set<string>([
  "getFiiData",
  "getDiiData",
]);

/** Tools that need an ISIN (equities only). */
const ISIN_TOOL_KEYS = new Set<string>([
  "getCompanyProfile",
  "getKeyRatios",
  "getShareHoldings",
  "getIncomeStatement",
  "getBalanceSheet",
  "getCashFlow",
  "getCorporateActions",
]);

const instrumentKindSchema = z.enum(["equity", "index", "etf"]);

const SEGMENTS_BY_KIND: Record<
  z.infer<typeof instrumentKindSchema>,
  string[]
> = {
  equity: ["NSE_EQ", "BSE_EQ"],
  etf: ["NSE_EQ", "BSE_EQ"],
  index: ["NSE_INDEX", "BSE_INDEX"],
};

const extractOutputSchema = z.object({
  isAboutSpecificInstrument: z.boolean(),
  title: z.string().max(120).nullable(),
  entities: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        kind: instrumentKindSchema,
        symbolGuess: z.string().max(40).nullable(),
        searchTerms: z.array(z.string().min(1).max(80)).min(1).max(4),
      }),
    )
    .max(MAX_ENTITIES),
});

type ExtractedEntity = z.infer<typeof extractOutputSchema>["entities"][number];

function buildToolFlagShape() {
  const shape: Record<string, z.ZodBoolean> = {};
  for (const key of CHAT_UPSTOX_TOOL_KEYS) {
    shape[key] = z.boolean();
  }
  return shape;
}

const matchAndPlanOutputSchema = z.object({
  matches: z.array(
    z.object({
      entityIndex: z.number().int().min(0),
      /** Index into that entity's candidates; null when none fit. */
      candidateIndex: z.number().int().min(0).nullable(),
      confidence: z.enum(["high", "medium", "low"]),
    }),
  ),
  upstox: z.object(buildToolFlagShape()),
  reasoning: z.string().nullable(),
});

export type InstrumentDeterminerMatch = {
  instrument: StockResearchInstrument;
  confidence: "high" | "medium";
};

export type InstrumentDeterminerResult = {
  isAboutSpecificInstrument: boolean;
  title: string | null;
  matches: InstrumentDeterminerMatch[];
  /** Full Upstox flag record (non-chat tools always false). */
  upstox: UpstoxToolFlags;
  reasoning: string | null;
  model: string;
};

export type InstrumentDeterminerAgentParams = {
  /** Enhanced research prompt from the calling pipeline. */
  prompt: string;
  model?: string;
  abortSignal?: AbortSignal;
};

export function resolveInstrumentDeterminerModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.INSTRUMENT_DETERMINER_MODEL ?? process.env.DETERMINER_MODEL,
  );
}

function emptyUpstoxFlags(): UpstoxToolFlags {
  return Object.fromEntries(
    UPSTOX_DETERMINER_TOOL_KEYS.map((key) => [key, false]),
  ) as UpstoxToolFlags;
}

function notInstrumentSpecific(model: string): InstrumentDeterminerResult {
  return {
    isAboutSpecificInstrument: false,
    title: null,
    matches: [],
    upstox: emptyUpstoxFlags(),
    reasoning: null,
    model,
  };
}

function buildExtractSystemPrompt(): string {
  return [
    "You classify research prompts for an Indian stock-market research product.",
    "Decide whether the prompt is about one or more SPECIFIC listed instruments on NSE/BSE: a company's stock, a market index (e.g. NIFTY 50, SENSEX, NIFTY BANK) or an ETF.",
    "",
    "isAboutSpecificInstrument = true only when a named company, index or ETF is central to the question (its price, results, valuation, news, outlook, comparison).",
    "isAboutSpecificInstrument = false for macro/economy/policy/sector-wide or general market questions with no specific instrument, and for unlisted or foreign-only companies.",
    "",
    "When true:",
    '- title: short label for the instruments, e.g. "Reliance Industries" or "HDFC Bank vs ICICI Bank".',
    `- entities: up to ${MAX_ENTITIES}, most important first.`,
    "- kind: equity, index or etf.",
    "- symbolGuess: the NSE trading symbol if you know it (e.g. RELIANCE, HDFCBANK, TCS), else null.",
    '- searchTerms: 1–4 strings that would PREFIX-match the official exchange name, most likely first. Exchange names are usually uppercase legal names (e.g. "RELIANCE INDUSTRIES", "HDFC BANK", "TATA CONSULTANCY", "NIFTY 50", "NIFTY BANK"). Include the common short name too (e.g. "INFOSYS", "INFY").',
    "",
    "When false: title null, entities empty.",
  ].join("\n");
}

function buildToolCatalog(): string {
  return CHAT_UPSTOX_TOOL_KEYS.map(
    (key) => `- ${key}: ${upstoxApis[key].detailedDescription}`,
  ).join("\n");
}

function buildMatchAndPlanSystemPrompt(): string {
  return [
    "You resolve instruments and plan Upstox data calls for a stock-market research chat.",
    "",
    "1) matches: for every entity, choose the candidate (by candidateIndex) that is the instrument the user means.",
    "   - Prefer the NSE listing (segment NSE_EQ / NSE_INDEX) over BSE when both exist.",
    "   - For equities prefer instrumentType EQ; avoid SME / BE / bond / warrant rows unless the user clearly means them.",
    '   - Watch for similarly named companies (e.g. "Tata Motors" vs "Tata Motors DVR"); pick the plain main listing unless the prompt says otherwise.',
    "   - confidence high = clearly the intended instrument; medium = likely; low = unsure. Use candidateIndex null when nothing fits.",
    "",
    "2) upstox: set true only for tools that help answer THIS question. Results feed a chat reply, so be selective — speed matters.",
    "   - Price / 'how is it doing' questions: getFullMarketQuotes, getHistoricalCandles (90 days daily).",
    "   - Intraday / 'today' moves: add getIntradayCandles.",
    "   - Fundamentals / valuation / 'should I invest': getKeyRatios, getIncomeStatement, getShareHoldings, getCompanyProfile; balance sheet / cash flow only when debt, cash or balance-sheet strength matters.",
    "   - News / why it moved: getInstrumentNews, getCorporateActions for dividends/splits/bonus.",
    "   - Peers / comparison: getCompetitors.",
    "   - Market-wide flows: getFiiData / getDiiData only when institutional flows are relevant.",
    "   - Fundamental tools need an ISIN: skip them for indices.",
    "   - Usually 2–6 tools are enough; enable more only for broad 'full analysis' questions.",
    "",
    "## Upstox tools",
    buildToolCatalog(),
  ].join("\n");
}

type InstrumentRow = Awaited<
  ReturnType<typeof searchInstrumentsByNameOrShortName>
>[number];

/** Parallel DB lookups for one entity; deduped by instrumentKey, exact symbol hits first. */
async function lookupEntityCandidates(
  entity: ExtractedEntity,
): Promise<InstrumentRow[]> {
  const segments = SEGMENTS_BY_KIND[entity.kind];
  const terms = [...new Set(entity.searchTerms.map((term) => term.trim()))]
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TERMS);

  const symbolLookups =
    entity.symbolGuess && entity.kind !== "index"
      ? [
          findInstrumentsByTradingSymbol({
            segment: "NSE_EQ",
            instrumentType: "EQ",
            tradingSymbol: entity.symbolGuess.trim().toUpperCase(),
          }),
        ]
      : [];
  const nameLookups = terms.flatMap((query) =>
    segments.map((segment) =>
      searchInstrumentsByNameOrShortName({
        query,
        segment,
        limit: CANDIDATES_PER_QUERY,
      }),
    ),
  );

  const settled = await Promise.allSettled([...symbolLookups, ...nameLookups]);
  const seen = new Set<string>();
  const rows: InstrumentRow[] = [];
  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }
    for (const row of result.value) {
      if (seen.has(row.instrumentKey)) {
        continue;
      }
      seen.add(row.instrumentKey);
      rows.push(row);
    }
  }
  return rows.slice(0, MAX_CANDIDATES_PER_ENTITY);
}

/** Prisma rows carry Decimal/Date values; JSON-normalize them before parsing. */
function toStockResearchInstrument(
  row: InstrumentRow,
): StockResearchInstrument {
  return normalizeStockResearchInstrument(toJsonSafeStepOutput(row));
}

function toFullUpstoxFlags(
  chatFlags: Record<string, boolean>,
  matches: InstrumentDeterminerMatch[],
): UpstoxToolFlags {
  const flags = emptyUpstoxFlags();
  const anyIsin = matches.some((match) => match.instrument.isin);
  for (const key of CHAT_UPSTOX_TOOL_KEYS) {
    flags[key] =
      chatFlags[key] === true && (anyIsin || !ISIN_TOOL_KEYS.has(key));
  }
  return flags;
}

async function runInstrumentDeterminerCore(
  params: InstrumentDeterminerAgentParams,
  generate: typeof aiClient.generate,
): Promise<InstrumentDeterminerResult> {
  const model = resolveInstrumentDeterminerModel(params.model);

  const extracted = await generate({
    model,
    system: buildExtractSystemPrompt(),
    prompt: params.prompt,
    schemaName: "InstrumentExtractOutput",
    schemaDescription:
      "Whether the prompt is instrument-specific, plus entities.",
    output: extractOutputSchema,
    temperature: 0,
    maxOutputTokens: 800,
    abortSignal: params.abortSignal,
  });

  if (!extracted.isAboutSpecificInstrument || extracted.entities.length === 0) {
    return notInstrumentSpecific(model);
  }

  const entities = extracted.entities.slice(0, MAX_ENTITIES);
  const candidatesByEntity = await Promise.all(
    entities.map((entity) => lookupEntityCandidates(entity)),
  );
  if (candidatesByEntity.every((rows) => rows.length === 0)) {
    return { ...notInstrumentSpecific(model), title: extracted.title };
  }

  const plan = await generate({
    model,
    system: buildMatchAndPlanSystemPrompt(),
    prompt: params.prompt,
    extraContext: {
      entities: entities.map((entity, entityIndex) => ({
        entityIndex,
        name: entity.name,
        kind: entity.kind,
        symbolGuess: entity.symbolGuess,
        candidates: candidatesByEntity[entityIndex]!.map(
          (row, candidateIndex) => ({
            candidateIndex,
            name: row.name,
            shortName: row.shortName,
            tradingSymbol: row.tradingSymbol,
            exchange: row.exchange,
            segment: row.segment,
            instrumentType: row.instrumentType,
            isin: row.isin,
          }),
        ),
      })),
    },
    schemaName: "InstrumentMatchAndPlanOutput",
    schemaDescription: "Chosen candidate per entity plus Upstox tool flags.",
    output: matchAndPlanOutputSchema,
    temperature: 0,
    maxOutputTokens: 1200,
    abortSignal: params.abortSignal,
  });

  const seenKeys = new Set<string>();
  const matches: InstrumentDeterminerMatch[] = [];
  for (const match of plan.matches) {
    if (match.candidateIndex == null || match.confidence === "low") {
      continue;
    }
    const row = candidatesByEntity[match.entityIndex]?.[match.candidateIndex];
    if (!row || seenKeys.has(row.instrumentKey)) {
      continue;
    }
    seenKeys.add(row.instrumentKey);
    matches.push({
      instrument: toStockResearchInstrument(row),
      confidence: match.confidence,
    });
  }

  if (matches.length === 0) {
    return { ...notInstrumentSpecific(model), title: extracted.title };
  }

  return {
    isAboutSpecificInstrument: true,
    title: extracted.title ?? matches.map((m) => m.instrument.name).join(", "),
    matches,
    upstox: toFullUpstoxFlags(plan.upstox, matches),
    reasoning: plan.reasoning,
    model,
  };
}

export function createInstrumentDeterminerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return async function instrumentDeterminerAgent(
    params: InstrumentDeterminerAgentParams,
  ): Promise<InstrumentDeterminerResult> {
    return await runInstrumentDeterminerCore(
      params,
      client.generate.bind(client),
    );
  };
}

export async function runInstrumentDeterminerAgent(
  params: InstrumentDeterminerAgentParams,
): Promise<InstrumentDeterminerResult> {
  return await runInstrumentDeterminerCore(
    params,
    aiClient.generate.bind(aiClient),
  );
}
