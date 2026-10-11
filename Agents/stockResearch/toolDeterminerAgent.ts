/**
 * Stock research tool determiner — given a resolved instrument and an invest/research
 * prompt, selects which Upstox and SerpAPI tools the pipeline should call (boolean flags).
 */

import {
  aiClient,
  createAIClient,
  type AIClientOptions,
} from "@/clients/AIClient";
import { InstrumentSchema, type Instrument } from "@/lib/instruments/instruments.schema";
import { resolveOpenAiModelId } from "@/lib/openAiModel";
import { serpEngines } from "@/SERP/index";
import { upstoxApis, type UpstoxApiKey } from "@/services/upstox/index";
import { z } from "zod";
import { agent } from "@/lib/observability";

export const UPSTOX_DETERMINER_TOOL_KEYS = Object.keys(upstoxApis).filter(
  (key) => key !== "assertMarginApiNotUsed" && key !== "testUpstoxConnection",
) as Exclude<UpstoxApiKey, "assertMarginApiNotUsed" | "testUpstoxConnection">[];

export const SERP_DETERMINER_TOOL_KEYS = Object.keys(
  serpEngines,
) as (keyof typeof serpEngines)[];

const prismaInstrumentShapeSchema = z
  .object({
    instrumentKey: z.string().min(1),
    segment: z.string().min(1),
    exchange: z.string().min(1),
    instrumentType: z.string(),
    tradingSymbol: z.string().min(1),
    name: z.string().min(1),
    exchangeToken: z.string().optional(),
    isin: z.string().nullable().optional(),
    shortName: z.string().nullable().optional(),
    securityType: z.string().nullable().optional(),
    underlyingSymbol: z.string().nullable().optional(),
    underlyingKey: z.string().nullable().optional(),
    underlyingType: z.string().nullable().optional(),
    expiry: z.coerce.date().nullable().optional(),
    strikePrice: z.union([z.number(), z.string()]).nullable().optional(),
  })
  .passthrough();

export type StockResearchInstrument = {
  instrumentKey: string;
  segment: string;
  exchange: string;
  instrumentType: string;
  tradingSymbol: string;
  name: string;
  exchangeToken?: string;
  isin: string | null;
  shortName: string | null;
  underlyingSymbol: string | null;
  underlyingKey: string | null;
  underlyingType: string | null;
  expiry: string | null;
  strikePrice: number | null;
  raw?: Record<string, unknown>;
};

export function normalizeStockResearchInstrument(
  input: unknown,
): StockResearchInstrument {
  const bod = InstrumentSchema.safeParse(input);
  if (bod.success) {
    return mapBodInstrument(bod.data);
  }

  const db = prismaInstrumentShapeSchema.parse(input);
  return {
    instrumentKey: db.instrumentKey,
    segment: db.segment,
    exchange: db.exchange,
    instrumentType: db.instrumentType,
    tradingSymbol: db.tradingSymbol,
    name: db.name,
    exchangeToken: db.exchangeToken,
    isin: db.isin?.trim() || null,
    shortName: db.shortName?.trim() || null,
    underlyingSymbol: db.underlyingSymbol?.trim() || null,
    underlyingKey: db.underlyingKey?.trim() || null,
    underlyingType: db.underlyingType?.trim() || null,
    expiry: db.expiry ? db.expiry.toISOString() : null,
    strikePrice:
      db.strikePrice == null
        ? null
        : typeof db.strikePrice === "number"
          ? db.strikePrice
          : Number(db.strikePrice),
  };
}

function mapBodInstrument(i: Instrument): StockResearchInstrument {
  return {
    instrumentKey: i.instrument_key,
    segment: i.segment,
    exchange: i.exchange,
    instrumentType: i.instrument_type,
    tradingSymbol: i.trading_symbol,
    name: i.name,
    exchangeToken: i.exchange_token,
    isin: i.isin?.trim() || null,
    shortName: i.short_name?.trim() || null,
    underlyingSymbol: i.underlying_symbol?.trim() || null,
    underlyingKey: i.underlying_key?.trim() || null,
    underlyingType: i.underlying_type?.trim() || null,
    expiry:
      i.expiry != null ? new Date(i.expiry).toISOString() : null,
    strikePrice: i.strike_price ?? null,
    raw: i as Record<string, unknown>,
  };
}

function buildBooleanShape(keys: readonly string[]) {
  const shape: Record<string, z.ZodBoolean> = {};
  for (const key of keys) {
    shape[key] = z.boolean();
  }
  return shape;
}

export const toolDeterminerModelOutputSchema = z.object({
  reasoning: z.string().nullable(),
  upstox: z.object(buildBooleanShape(UPSTOX_DETERMINER_TOOL_KEYS)),
  serp: z.object(buildBooleanShape(SERP_DETERMINER_TOOL_KEYS)),
});

export type ToolDeterminerModelOutput = z.infer<
  typeof toolDeterminerModelOutputSchema
>;

export type UpstoxToolFlags = Record<
  (typeof UPSTOX_DETERMINER_TOOL_KEYS)[number],
  boolean
>;

export type SerpToolFlags = Record<
  (typeof SERP_DETERMINER_TOOL_KEYS)[number],
  boolean
>;

export type ToolDeterminerResult = {
  reasoning: string | null;
  upstox: UpstoxToolFlags;
  serp: SerpToolFlags;
  instrument: StockResearchInstrument;
  model: string;
};

export type ToolDeterminerAgentParams = {
  userPrompt: string;
  instrument: unknown;
  model?: string;
  system?: string;
  abortSignal?: AbortSignal;
};

export function resolveToolDeterminerModel(override?: string): string {
  return resolveOpenAiModelId(
    override,
    process.env.STOCK_RESEARCH_TOOL_DETERMINER_MODEL ??
      process.env.DETERMINER_MODEL,
  );
}

function isEquityWithIsin(instrument: StockResearchInstrument): boolean {
  const type = instrument.instrumentType.toUpperCase();
  return Boolean(instrument.isin) && (type === "EQ" || type === "BE");
}

function isDerivative(instrument: StockResearchInstrument): boolean {
  const type = instrument.instrumentType.toUpperCase();
  return (
    type === "CE" ||
    type === "PE" ||
    type === "FUT" ||
    instrument.segment.includes("_FO") ||
    instrument.segment.includes("_CD")
  );
}

function wantsDeepResearch(prompt: string): boolean {
  const normalized = prompt.toLowerCase();
  return (
    normalized.includes("invest") ||
    normalized.includes("detailed") ||
    normalized.includes("deep dive") ||
    normalized.includes("as much") ||
    normalized.includes("comprehensive") ||
    normalized.includes("should i buy") ||
    normalized.includes("analysis")
  );
}

/** Ensures broad coverage when the user asks for an investment-grade brief. */
export function applyInvestResearchMinimums(
  flags: ToolDeterminerModelOutput,
  instrument: StockResearchInstrument,
  userPrompt: string,
): ToolDeterminerModelOutput {
  if (!wantsDeepResearch(userPrompt)) {
    return flags;
  }

  const upstox = { ...flags.upstox };
  const serp = { ...flags.serp };

  upstox.getFullMarketQuotes = true;
  upstox.getLtpQuotes = true;
  upstox.getOhlcQuotes = true;
  upstox.getHistoricalCandles = true;
  upstox.getInstrumentNews = true;

  serp.searchGoogleFinance = true;
  serp.searchGoogleNews = true;
  serp.searchGoogleNewsTab = true;
  serp.searchGoogle = true;

  if (isEquityWithIsin(instrument)) {
    upstox.getCompanyProfile = true;
    upstox.getKeyRatios = true;
    upstox.getShareHoldings = true;
    upstox.getIncomeStatement = true;
    upstox.getBalanceSheet = true;
    upstox.getCashFlow = true;
    upstox.getCorporateActions = true;
    upstox.getCompetitors = true;
  }

  if (isDerivative(instrument)) {
    upstox.getOptionChain = true;
    upstox.getOptionContracts = true;
    upstox.getOpenInterest = true;
    upstox.getChangeInOpenInterest = true;
    upstox.getMaxPain = true;
    upstox.getPutCallRatio = true;
    upstox.getOptionGreeks = true;
    upstox.getIntradayCandles = true;
  }

  upstox.getFiiData = true;
  upstox.getDiiData = true;
  upstox.getExchangeStatus = true;
  upstox.getMarketTimings = true;

  upstox.authorizeMarketDataFeed = false;
  upstox.createMarketDataStreamer = false;

  return { ...flags, upstox, serp };
}

function buildUpstoxCatalog(): string {
  return UPSTOX_DETERMINER_TOOL_KEYS.map((key) => {
    const entry = upstoxApis[key];
    return [
      `### ${key}`,
      entry.detailedDescription,
      `Input: ${entry.input}`,
      `Output: ${entry.output}`,
    ].join("\n");
  }).join("\n\n");
}

function buildSerpCatalog(): string {
  return SERP_DETERMINER_TOOL_KEYS.map((key) => {
    const entry = serpEngines[key];
    return [`### ${key}`, entry.description].join("\n");
  }).join("\n\n");
}

/** Bump whenever the system prompt below changes. */
export const PROMPT_VERSION = "v1";

function buildToolDeterminerSystemPrompt(): string {
  return [
    "You are a tool determiner for stock investment research.",
    "The user chose a specific instrument and wants investment-oriented research with as much relevant detail as practical.",
    "Return boolean flags for each Upstox API and each Serp engine: true = pipeline should call it, false = skip.",
    "Prefer true for tools that add non-duplicative facts (price, fundamentals, news, derivatives analytics, web context).",
    "Avoid redundant calls (e.g. do not enable both getFullMarketQuotes and getLtpQuotes unless both add value; default to getFullMarketQuotes + getOhlcQuotes for equities).",
    "Never enable authorizeMarketDataFeed or createMarketDataStreamer unless the user explicitly asks for live streaming quotes.",
    "For listed equities with ISIN: enable fundamentals (profile, ratios, holdings, statements, corporate actions, competitors) when the user wants to invest or requests depth.",
    "For derivatives (FUT/CE/PE): prioritize option chain, OI/change OI, max pain, PCR, greeks, intraday/historical candles; skip equity fundamentals without ISIN.",
    "Use Serp for narrative news, analyst/web context, Google Finance page, and AI-mode synthesis when helpful.",
    "Set searchGoogleMaps* false unless the user asks about branches/locations.",
    "Set searchYoutubeVideoTranscript false unless video/transcript evidence is needed.",
    "Include macro context (getFiiData, getDiiData) when evaluating market-wide flows relevant to the thesis.",
    "Provide concise reasoning summarizing why groups of tools were enabled.",
    "",
    "## Upstox tools",
    buildUpstoxCatalog(),
    "",
    "## Serp tools",
    buildSerpCatalog(),
  ].join("\n");
}

export function buildToolDeterminerResultFromModelOutput(
  raw: ToolDeterminerModelOutput,
  instrument: StockResearchInstrument,
  options: { model?: string; userPrompt?: string } = {},
): ToolDeterminerResult {
  const adjusted = options.userPrompt
    ? applyInvestResearchMinimums(raw, instrument, options.userPrompt)
    : raw;

  return {
    reasoning: adjusted.reasoning,
    upstox: adjusted.upstox as UpstoxToolFlags,
    serp: adjusted.serp as SerpToolFlags,
    instrument,
    model: options.model ?? "test-model",
  };
}

export function countEnabledTools(result: ToolDeterminerResult): {
  upstox: number;
  serp: number;
  total: number;
} {
  const upstox = UPSTOX_DETERMINER_TOOL_KEYS.filter((k) => result.upstox[k])
    .length;
  const serp = SERP_DETERMINER_TOOL_KEYS.filter((k) => result.serp[k]).length;
  return { upstox, serp, total: upstox + serp };
}

async function runToolDeterminerCore(
  params: ToolDeterminerAgentParams,
  generate: typeof aiClient.generate,
): Promise<ToolDeterminerResult> {
  const instrument = normalizeStockResearchInstrument(params.instrument);
  const model = resolveToolDeterminerModel(params.model);

  const raw = await generate({
    model,
    system: params.system ?? buildToolDeterminerSystemPrompt(),
    prompt: params.userPrompt,
    extraContext: {
      instrument,
      investIntent: wantsDeepResearch(params.userPrompt),
      isEquityWithIsin: isEquityWithIsin(instrument),
      isDerivative: isDerivative(instrument),
    },
    schemaName: "StockResearchToolDeterminerOutput",
    schemaDescription:
      "Boolean flags for each Upstox and Serp tool key, plus reasoning.",
    output: toolDeterminerModelOutputSchema,
    temperature: 0,
    maxOutputTokens: 4096,
    abortSignal: params.abortSignal,
  });

  return buildToolDeterminerResultFromModelOutput(raw, instrument, {
    model,
    userPrompt: params.userPrompt,
  });
}

export function createToolDeterminerAgent(options: AIClientOptions = {}) {
  const client = createAIClient(options);

  return async function toolDeterminerAgent(
    params: ToolDeterminerAgentParams,
  ): Promise<ToolDeterminerResult> {
    return await runToolDeterminerCore(params, client.generate.bind(client));
  };
}

async function runToolDeterminerAgentUntraced(
  params: ToolDeterminerAgentParams,
): Promise<ToolDeterminerResult> {
  return await runToolDeterminerCore(params, aiClient.generate.bind(aiClient));
}

export const runToolDeterminerAgent = agent("stockResearch.toolDeterminer", runToolDeterminerAgentUntraced);
