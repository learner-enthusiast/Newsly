/**
 * Copy for the research landing form (stock / ETF / mutual fund). Kept in sync
 * by hand with the pipeline in `Agents/stockResearch/assetProfiles.ts` — report
 * sections mirror each profile's `reportStructure`, coverage mirrors the
 * instrument segments the suggest endpoints search.
 */

import type { ResearchAssetType } from "@/services/stockResearch/stockResearchTypes";

export type ResearchLandingContent = {
  /** Short market-coverage line shown under the title. */
  marketLabel: string;
  /** What the search box can find. */
  covered: string[];
  /** What it can't, so users don't hunt for unsupported instruments. */
  notCovered: string[];
  /** One-tap search seeds; each fills the search box. */
  popularSearches: string[];
  /** One-tap question starters; each fills the prompt. */
  sampleQuestions: (name: string) => string[];
  /** Section headings of the generated report. */
  reportSections: { title: string; detail: string }[];
};

export const RESEARCH_LANDING_CONTENT: Record<
  ResearchAssetType,
  ResearchLandingContent
> = {
  STOCK: {
    marketLabel: "NSE-listed equities",
    covered: [
      "Equities listed on the National Stock Exchange (NSE)",
      "Large, mid and small caps across every sector",
      "Derivatives view for stocks traded in F&O",
    ],
    notCovered: [
      "Stocks listed only on BSE",
      "US, UK and other international exchanges",
    ],
    popularSearches: ["Reliance", "HDFC Bank", "TCS", "Infosys", "Tata Motors"],
    sampleQuestions: (name) => [
      `Is ${name} a good buy for the next 2–3 years?`,
      `How is ${name} valued against its peers?`,
      `Summarise ${name}'s latest quarterly results.`,
      `What are the biggest risks for ${name} right now?`,
    ],
    reportSections: [
      { title: "Summary", detail: "A direct answer to your question" },
      { title: "Price snapshot", detail: "Quote, OHLC, 52-week range" },
      { title: "Fundamentals", detail: "Key ratios and financial trends" },
      { title: "Ownership & flows", detail: "Shareholding, FII/DII context" },
      { title: "Recent news", detail: "Dated and cited developments" },
      { title: "Risks, bull & bear case", detail: "Both sides of the story" },
    ],
  },
  ETF: {
    marketLabel: "NSE & BSE-listed ETFs",
    covered: [
      "ETFs listed on NSE and BSE",
      "Equity index, sector, gold, silver and debt ETFs",
      "Indian ETFs tracking global indices (e.g. Nasdaq 100)",
    ],
    notCovered: [
      "ETFs listed abroad (e.g. SPY, QQQ, VOO)",
      "Unlisted index funds",
    ],
    popularSearches: [
      "NIFTY BEES",
      "GOLD BEES",
      "BANK BEES",
      "Nifty Next 50",
      "Nasdaq",
    ],
    sampleQuestions: (name) => [
      `Is ${name} a good core holding for long-term investing?`,
      `How do ${name}'s costs and tracking error compare with peers?`,
      `Is ${name} liquid enough? Does it trade near its NAV?`,
      `What are ${name}'s top holdings and sector mix?`,
    ],
    reportSections: [
      { title: "Summary", detail: "A direct answer to your question" },
      { title: "What it tracks", detail: "Underlying index and methodology" },
      { title: "Costs & tracking", detail: "Expense ratio, tracking error" },
      {
        title: "Holdings & liquidity",
        detail: "Exposure, volume, premium to NAV",
      },
      { title: "Performance", detail: "Returns vs the benchmark" },
      {
        title: "Alternatives & risks",
        detail: "Similar ETFs and who it suits",
      },
    ],
  },
  MUTUAL_FUND: {
    marketLabel: "Exchange-listed mutual fund units",
    covered: [
      "Mutual fund schemes whose units are listed on NSE or BSE",
      "Equity, debt and hybrid categories from Indian AMCs",
    ],
    notCovered: [
      "Schemes without exchange-listed units may not show up in search",
      "Funds domiciled outside India",
    ],
    popularSearches: [
      "SBI",
      "HDFC",
      "ICICI Prudential",
      "Nippon India",
      "Axis",
    ],
    sampleQuestions: (name) => [
      `Is ${name} suitable for a 5-year SIP?`,
      `How has ${name} performed against its category and benchmark?`,
      `What does ${name}'s portfolio look like? Is it concentrated?`,
      `How experienced is the fund manager of ${name}?`,
    ],
    reportSections: [
      { title: "Summary", detail: "A direct answer to your question" },
      {
        title: "Fund at a glance",
        detail: "Category, AMC, expense ratio, AUM",
      },
      { title: "Performance", detail: "Returns vs category and benchmark" },
      { title: "Portfolio", detail: "Top holdings, sector mix, style" },
      { title: "Management", detail: "Fund manager and AMC context" },
      { title: "Risks & suitability", detail: "Horizon, SIP vs lump sum" },
    ],
  },
};

export const RESEARCH_PIPELINE_STEPS = [
  {
    title: "Sharpen the brief",
    detail: "We turn your question into a focused research brief.",
  },
  {
    title: "Pull market data",
    detail:
      "Live quotes, price history and instrument news from the exchange feed.",
  },
  {
    title: "Search the web",
    detail:
      "Filings, factsheets and credible coverage — the most relevant pages are kept.",
  },
  {
    title: "Write the report",
    detail: "An analyst-style report with tables and every source cited.",
  },
] as const;
