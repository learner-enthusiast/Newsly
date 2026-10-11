/**
 * Per-asset research profiles for the stock / ETF / mutual fund pipeline.
 *
 * One pipeline serves all three asset types; these profiles supply what
 * differs: prompt guidance for each agent, the report structure, and — for
 * funds — a fixed Upstox / Serp tool plan. Funds skip the LLM tool determiner:
 * Upstox fundamentals endpoints take company ISINs (fund units are INF…), so
 * the useful tool set is small and known, and skipping the call saves latency.
 */

import {
  SERP_DETERMINER_TOOL_KEYS,
  UPSTOX_DETERMINER_TOOL_KEYS,
  type SerpToolFlags,
  type StockResearchInstrument,
  type ToolDeterminerResult,
  type UpstoxToolFlags,
} from "@/Agents/stockResearch/toolDeterminerAgent";
import type { ResearchAssetType } from "@/services/stockResearch/stockResearchTypes";

type AssetProfile = {
  /** Noun used in prompts, e.g. "listed stock". */
  noun: string;
  enhancerGuidance: string[];
  linkSelectorGuidance: string[];
  analystRole: string;
  reportStructure: string[];
};

export const RESEARCH_ASSET_PROFILES: Record<ResearchAssetType, AssetProfile> = {
  STOCK: {
    noun: "listed stock",
    enhancerGuidance: [
      'Focus areas examples: "valuation vs peers", "recent quarterly results", "promoter holding trend".',
    ],
    linkSelectorGuidance: [
      "Prefer: recent results coverage, earnings call notes, management commentary, analyst/broker views, regulatory filings, credible business press.",
    ],
    analystRole: "an equity research analyst",
    reportStructure: [
      "# <Company> (<SYMBOL>) — <short title reflecting the brief>",
      "## Summary — 3–5 bullet answer to the brief",
      "## Price & trading snapshot — table of key quote/OHLC/52-week figures",
      "## Business & fundamentals — profile, key ratios, financial statement trends (tables welcome)",
      "## Ownership & flows — shareholding pattern, FII/DII context",
      "## Recent news & developments — dated, cited",
      "## Derivatives view — only for F&O instruments or when option data exists",
      "## Risks",
      "## Bull vs bear case",
      "## Sources — bullet list of the web page links used",
    ],
  },
  ETF: {
    noun: "exchange-traded fund (ETF) listed on NSE/BSE",
    enhancerGuidance: [
      "Frame the brief around ETF questions: what index/asset it tracks, costs (expense ratio), tracking error / tracking difference, liquidity (volume, bid-ask, premium/discount to iNAV), AUM, holdings concentration, and how it compares with similar ETFs or index funds.",
      'Focus areas examples: "tracking error vs benchmark", "expense ratio vs peers", "liquidity and premium to NAV", "top holdings and sector mix".',
    ],
    linkSelectorGuidance: [
      "Prefer: the AMC's ETF factsheet / scheme page, NSE/BSE ETF pages, index provider methodology pages, value research / morningstar-style fund pages, credible coverage comparing ETFs.",
      "Avoid generic stock-market wraps that only mention the ETF in passing.",
    ],
    analystRole: "a fund research analyst covering Indian ETFs",
    reportStructure: [
      "# <ETF name> (<SYMBOL>) — <short title reflecting the brief>",
      "## Summary — 3–5 bullet answer to the brief",
      "## Price & trading snapshot — table: last price, day/52-week range, volume; premium/discount to NAV when available",
      "## What it tracks — underlying index or asset, methodology, rebalancing",
      "## Costs & tracking — expense ratio, tracking error / difference (cite sources)",
      "## Holdings & exposure — top holdings, sector/asset mix, concentration",
      "## Liquidity — traded volume, market-maker/iNAV notes, impact cost",
      "## Performance — returns over available periods vs the benchmark (from candles and sources)",
      "## Alternatives — similar ETFs / index funds to compare",
      "## Risks",
      "## Who it may suit",
      "## Sources — bullet list of the web page links used",
    ],
  },
  MUTUAL_FUND: {
    noun: "mutual fund scheme with exchange-listed units on NSE/BSE",
    enhancerGuidance: [
      "Frame the brief around mutual fund questions: fund category and objective, AMC and fund manager, expense ratio, AUM, returns vs category and benchmark, portfolio holdings and style, risk measures (volatility, drawdown), exit load, and SIP vs lump-sum suitability.",
      'Focus areas examples: "returns vs category average", "expense ratio", "portfolio concentration", "fund manager track record".',
    ],
    linkSelectorGuidance: [
      "Prefer: the AMC scheme page / factsheet, SEBI/AMFI data pages, value research / morningstar-style fund pages, credible fund reviews and category comparisons.",
      "Avoid generic stock-market wraps that only mention the fund in passing.",
    ],
    analystRole: "a mutual fund research analyst for Indian investors",
    reportStructure: [
      "# <Fund name> — <short title reflecting the brief>",
      "## Summary — 3–5 bullet answer to the brief",
      "## Fund at a glance — table: category, AMC, benchmark, expense ratio, AUM, exit load (cite sources)",
      "## Price snapshot — listed unit price / range from market data, with the caveat that listed units can be thinly traded",
      "## Performance — returns over available periods vs category and benchmark",
      "## Portfolio — top holdings, sector/asset mix, investment style",
      "## Management — fund manager(s) and AMC context",
      "## Risks — volatility, drawdowns, concentration, credit/duration risk for debt funds",
      "## Who it may suit — horizon, SIP vs lump sum",
      "## Sources — bullet list of the web page links used",
    ],
  },
};

function allFalse<T extends string>(keys: readonly T[]): Record<T, boolean> {
  return Object.fromEntries(keys.map((key) => [key, false])) as Record<T, boolean>;
}

function wantsToday(prompt: string): boolean {
  return /\b(today|intraday|right now|this morning|live)\b/i.test(prompt);
}

/**
 * Fixed tool plan for ETFs and mutual funds (no LLM call). Market data from
 * Upstox; costs, holdings and performance context from web search.
 */
export function buildFundToolPlan(
  assetType: Exclude<ResearchAssetType, "STOCK">,
  instrument: StockResearchInstrument,
  prompt: string,
): ToolDeterminerResult {
  const upstox = allFalse(UPSTOX_DETERMINER_TOOL_KEYS) as UpstoxToolFlags;
  const serp = allFalse(SERP_DETERMINER_TOOL_KEYS) as SerpToolFlags;

  upstox.getFullMarketQuotes = true;
  upstox.getOhlcQuotes = true;
  upstox.getHistoricalCandles = true;
  upstox.getIntradayCandles = wantsToday(prompt);
  upstox.getInstrumentNews = true;

  serp.searchGoogle = true;
  serp.searchGoogleNews = true;
  serp.searchGoogleAiMode = true;
  serp.searchGoogleFinance = assetType === "ETF";

  return {
    reasoning: `Fixed ${assetType === "ETF" ? "ETF" : "mutual fund"} plan: Upstox quotes, candles and news; web search for costs, holdings, performance and coverage.`,
    upstox,
    serp,
    instrument,
    model: "fixed-plan",
  };
}

/** Serp query wording per asset type (stock keeps the original queries). */
export function serpAssetTerms(assetType: ResearchAssetType): {
  news: string;
  analysis: string;
  invest: string;
  video: string;
} {
  switch (assetType) {
    case "ETF":
      return {
        news: "ETF news",
        analysis: "ETF expense ratio tracking error review",
        invest: "Should I invest in ETF",
        video: "ETF review",
      };
    case "MUTUAL_FUND":
      return {
        news: "mutual fund news",
        analysis: "mutual fund returns expense ratio portfolio review",
        invest: "Should I invest in mutual fund",
        video: "mutual fund review",
      };
    default:
      return {
        news: "stock news",
        analysis: "investment analysis",
        invest: "Should I invest in",
        video: "stock analysis",
      };
  }
}
