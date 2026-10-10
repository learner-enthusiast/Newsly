import { createHash } from "node:crypto";
import type { StockResearchInstrument } from "@/Agents/stockResearch/toolDeterminerAgent";
import {
  SERP_DETERMINER_TOOL_KEYS,
  UPSTOX_DETERMINER_TOOL_KEYS,
  type SerpToolFlags,
  type ToolDeterminerResult,
  type UpstoxToolFlags,
} from "@/Agents/stockResearch/toolDeterminerAgent";
import { serpEngines } from "@/SERP/index";
import { upstoxApis } from "@/services/upstox/index";
import { todayIsoDateUtc } from "@/services/chat/researchPrompt";
import { serpSearchWithLocationFallback } from "@/services/chat/serpApiLocation";
import type {
  StockResearchProvider,
  StockResearchResourceType,
} from "@/db/generated/client";

export type StockResearchToolExecutionResult = {
  provider: StockResearchProvider;
  tool: string;
  ok: boolean;
  skipped: boolean;
  error?: string;
  rawData?: unknown;
  resourceType: StockResearchResourceType;
  title: string;
  externalId: string;
  contentHash: string;
};

function isoDateDaysAgo(days: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function expiryYmd(instrument: StockResearchInstrument): string | null {
  if (!instrument.expiry) {
    return null;
  }
  return instrument.expiry.slice(0, 10);
}

function underlyingInstrumentKey(instrument: StockResearchInstrument): string {
  return instrument.underlyingKey ?? instrument.instrumentKey;
}

function toolContentHash(
  provider: string,
  tool: string,
  instrumentKey: string,
): string {
  return createHash("sha256")
    .update(`${provider}:${tool}:${instrumentKey}`)
    .digest("hex")
    .slice(0, 40);
}

function upstoxResourceType(tool: string): StockResearchResourceType {
  if (
    tool.includes("News") ||
    tool === "getCorporateActions"
  ) {
    return "NEWS";
  }
  if (
    tool.startsWith("getOption") ||
    tool.includes("OpenInterest") ||
    tool.includes("Pain") ||
    tool.includes("PutCall") ||
    tool.includes("Greek")
  ) {
    return "OPTIONS";
  }
  if (tool.includes("Historical") || tool.includes("Intraday")) {
    return "HISTORICAL";
  }
  if (
    tool.startsWith("getCompany") ||
    tool.startsWith("getKey") ||
    tool.startsWith("getShare") ||
    tool.startsWith("getBalance") ||
    tool.startsWith("getIncome") ||
    tool.startsWith("getCash") ||
    tool.startsWith("getCompetitors")
  ) {
    return "FUNDAMENTAL";
  }
  if (tool.startsWith("getFii") || tool.startsWith("getDii")) {
    return "OTHER";
  }
  return "MARKET_DATA";
}

function serpResourceType(tool: string): StockResearchResourceType {
  if (tool.includes("News") || tool.includes("Youtube")) {
    return "NEWS";
  }
  if (tool === "searchGoogleAiMode") {
    return "SYNTHESIS";
  }
  return "WEB_PAGE";
}

async function runUpstoxTool(
  tool: (typeof UPSTOX_DETERMINER_TOOL_KEYS)[number],
  instrument: StockResearchInstrument,
): Promise<unknown> {
  const key = instrument.instrumentKey;
  const keys = [key];
  const isin = instrument.isin;
  const today = todayIsoDateUtc();
  const expiry = expiryYmd(instrument);
  const underlying = underlyingInstrumentKey(instrument);

  switch (tool) {
    case "getFullMarketQuotes":
      return upstoxApis.getFullMarketQuotes.fn(keys);
    case "getOhlcQuotes":
      return upstoxApis.getOhlcQuotes.fn(keys, "1d");
    case "getLtpQuotes":
      return upstoxApis.getLtpQuotes.fn(keys);
    case "getOptionGreeks":
      return upstoxApis.getOptionGreeks.fn(keys);
    case "getHistoricalCandles":
      return upstoxApis.getHistoricalCandles.fn({
        instrumentKey: key,
        unit: "days",
        interval: "1",
        toDate: today,
        fromDate: isoDateDaysAgo(90),
      });
    case "getIntradayCandles":
      return upstoxApis.getIntradayCandles.fn({
        instrumentKey: key,
        unit: "minutes",
        interval: "15",
      });
    case "getCompanyProfile":
      if (!isin) throw new Error("ISIN required for getCompanyProfile");
      return upstoxApis.getCompanyProfile.fn(isin);
    case "getKeyRatios":
      if (!isin) throw new Error("ISIN required for getKeyRatios");
      return upstoxApis.getKeyRatios.fn(isin);
    case "getShareHoldings":
      if (!isin) throw new Error("ISIN required for getShareHoldings");
      return upstoxApis.getShareHoldings.fn(isin);
    case "getBalanceSheet":
      if (!isin) throw new Error("ISIN required for getBalanceSheet");
      return upstoxApis.getBalanceSheet.fn(isin, {
        type: "consolidated",
        timePeriod: "yearly",
      });
    case "getIncomeStatement":
      if (!isin) throw new Error("ISIN required for getIncomeStatement");
      return upstoxApis.getIncomeStatement.fn(isin, {
        type: "consolidated",
        timePeriod: "yearly",
      });
    case "getCashFlow":
      if (!isin) throw new Error("ISIN required for getCashFlow");
      return upstoxApis.getCashFlow.fn(isin, {
        type: "consolidated",
        timePeriod: "yearly",
      });
    case "getCorporateActions":
      if (!isin) throw new Error("ISIN required for getCorporateActions");
      return upstoxApis.getCorporateActions.fn(isin);
    case "getCompetitors":
      return upstoxApis.getCompetitors.fn(isin ?? key);
    case "getFiiData":
      return upstoxApis.getFiiData.fn({ interval: "1D" });
    case "getDiiData":
      return upstoxApis.getDiiData.fn({ interval: "1D" });
    case "getOpenInterest":
      if (!expiry) throw new Error("expiry required for getOpenInterest");
      return upstoxApis.getOpenInterest.fn({
        instrumentKey: underlying,
        expiry,
        date: today,
      });
    case "getChangeInOpenInterest":
      if (!expiry) throw new Error("expiry required for getChangeInOpenInterest");
      return upstoxApis.getChangeInOpenInterest.fn({
        instrumentKey: underlying,
        expiry,
        date: today,
        intervalDays: 1,
      });
    case "getMaxPain":
      if (!expiry) throw new Error("expiry required for getMaxPain");
      return upstoxApis.getMaxPain.fn({
        instrumentKey: underlying,
        expiry,
        date: today,
        bucketIntervalMinutes: 15,
      });
    case "getPutCallRatio":
      if (!expiry) throw new Error("expiry required for getPutCallRatio");
      return upstoxApis.getPutCallRatio.fn({
        instrumentKey: underlying,
        expiry,
        date: today,
        bucketIntervalMinutes: 15,
      });
    case "getMarketHolidays":
      return upstoxApis.getMarketHolidays.fn();
    case "getMarketTimings":
      return upstoxApis.getMarketTimings.fn(today);
    case "getExchangeStatus":
      return upstoxApis.getExchangeStatus.fn(instrument.exchange);
    case "getOptionChain":
      if (!expiry) throw new Error("expiry required for getOptionChain");
      return upstoxApis.getOptionChain.fn({
        instrumentKey: underlying,
        expiryDate: expiry,
      });
    case "getOptionContracts":
      return upstoxApis.getOptionContracts.fn(underlying, expiry ?? undefined);
    case "getBrokerageCharges": {
      const lot = 1;
      return upstoxApis.getBrokerageCharges.fn({
        instrumentToken: key,
        quantity: lot,
        product: "D",
        transactionType: "BUY",
        price: 100,
      });
    }
    case "getIpos":
      return upstoxApis.getIpos.fn({ status: "open", records: 10 });
    case "getIpoDetails":
      throw new Error("getIpoDetails requires ipoId; skip for instrument research");
    case "getInstrumentNews":
      return upstoxApis.getInstrumentNews.fn({ instrumentKeys: keys });
    case "authorizeMarketDataFeed":
      return upstoxApis.authorizeMarketDataFeed.fn();
    case "createMarketDataStreamer":
      throw new Error("createMarketDataStreamer is not executed in batch pipeline");
    default: {
      const _exhaustive: never = tool;
      throw new Error(`Unhandled Upstox tool: ${_exhaustive}`);
    }
  }
}

function buildSerpInput(
  tool: (typeof SERP_DETERMINER_TOOL_KEYS)[number],
  instrument: StockResearchInstrument,
  userPrompt: string,
): Record<string, unknown> {
  const label = instrument.shortName ?? instrument.name;
  const sym = instrument.tradingSymbol;
  const ex = instrument.exchange;
  const base = { gl: "in", hl: "en" };

  switch (tool) {
    case "searchGoogleFinance":
      return { ...base, q: `${sym}:${ex}` };
    case "searchGoogleNews":
      return { ...base, q: `${label} ${sym} stock news` };
    case "searchGoogleNewsTab":
      return { ...base, q: `${label} ${sym} investment analysis` };
    case "searchGoogle":
      return {
        ...base,
        q: `${label} (${sym}) ${userPrompt}`.slice(0, 200),
        num: 10,
      };
    case "searchGoogleAiMode":
      return {
        ...base,
        q: `Should I invest in ${label} (${sym})? ${userPrompt}`.slice(0, 240),
      };
    case "searchYoutube":
      return {
        ...base,
        search_query: `${label} ${sym} stock analysis`,
      };
    case "searchYoutubeVideoTranscript":
      throw new Error("searchYoutubeVideoTranscript requires video id");
    case "searchGoogleMapsAutocomplete":
      return {
        ...base,
        q: `${label} headquarters`,
        ll: "@28.6139,77.2090,10z",
      };
    case "searchGoogleMaps":
      return {
        ...base,
        type: "search",
        q: `${label} office ${ex}`,
      };
    default: {
      const _exhaustive: never = tool;
      throw new Error(`Unhandled Serp tool: ${_exhaustive}`);
    }
  }
}

async function runSerpTool(
  tool: (typeof SERP_DETERMINER_TOOL_KEYS)[number],
  instrument: StockResearchInstrument,
  userPrompt: string,
): Promise<unknown> {
  const engine = serpEngines[tool];
  const input = buildSerpInput(tool, instrument, userPrompt);
  return serpSearchWithLocationFallback(
    (params) => engine.fn(params as never),
    input,
  );
}

async function executeFlaggedTools<TTool extends string>(options: {
  provider: StockResearchProvider;
  flags: Record<TTool, boolean>;
  toolKeys: readonly TTool[];
  run: (tool: TTool) => Promise<unknown>;
  instrument: StockResearchInstrument;
  resourceTypeForTool: (tool: TTool) => StockResearchResourceType;
}): Promise<StockResearchToolExecutionResult[]> {
  const enabled = options.toolKeys.filter((tool) => options.flags[tool]);
  const settled = await Promise.allSettled(
    enabled.map(async (tool) => {
      const rawData = await options.run(tool);
      return {
        provider: options.provider,
        tool,
        ok: true,
        skipped: false,
        rawData,
        resourceType: options.resourceTypeForTool(tool),
        title: `${options.provider} ${tool}`,
        externalId: tool,
        contentHash: toolContentHash(
          options.provider,
          tool,
          options.instrument.instrumentKey,
        ),
      } satisfies StockResearchToolExecutionResult;
    }),
  );

  return settled.map((result, index) => {
    const tool = enabled[index]!;
    if (result.status === "fulfilled") {
      return result.value;
    }
    const message =
      result.reason instanceof Error
        ? result.reason.message
        : String(result.reason);
    const skipped =
      message.includes("required") ||
      message.includes("skip") ||
      message.includes("not executed");
    return {
      provider: options.provider,
      tool,
      ok: false,
      skipped,
      error: message,
      resourceType: options.resourceTypeForTool(tool),
      title: `${options.provider} ${tool}`,
      externalId: tool,
      contentHash: toolContentHash(
        options.provider,
        tool,
        options.instrument.instrumentKey,
      ),
    };
  });
}

export async function executeStockResearchUpstoxTools(
  flags: UpstoxToolFlags,
  instrument: StockResearchInstrument,
): Promise<StockResearchToolExecutionResult[]> {
  return executeFlaggedTools({
    provider: "UPSTOX",
    flags,
    toolKeys: UPSTOX_DETERMINER_TOOL_KEYS,
    instrument,
    run: (tool) => runUpstoxTool(tool, instrument),
    resourceTypeForTool: (tool) => upstoxResourceType(tool),
  });
}

export async function executeStockResearchSerpTools(
  flags: SerpToolFlags,
  instrument: StockResearchInstrument,
  userPrompt: string,
): Promise<StockResearchToolExecutionResult[]> {
  return executeFlaggedTools({
    provider: "SERP",
    flags,
    toolKeys: SERP_DETERMINER_TOOL_KEYS,
    instrument,
    run: (tool) => runSerpTool(tool, instrument, userPrompt),
    resourceTypeForTool: (tool) => serpResourceType(tool),
  });
}

export async function executeStockResearchToolPlan(
  plan: ToolDeterminerResult,
  userPrompt: string,
): Promise<StockResearchToolExecutionResult[]> {
  const [upstox, serp] = await Promise.all([
    executeStockResearchUpstoxTools(plan.upstox, plan.instrument),
    executeStockResearchSerpTools(plan.serp, plan.instrument, userPrompt),
  ]);
  return [...upstox, ...serp];
}
