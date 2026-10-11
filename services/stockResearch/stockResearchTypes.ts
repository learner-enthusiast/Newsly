/** Client-safe stock research API types (no server imports). */

export const STOCK_RESEARCHES_MAX_LIMIT = 10;
export const STOCK_RESEARCHES_PAGE_SIZE = 10;
export const STOCK_RESEARCHES_SIDEBAR_LIMIT = 5;
export const STOCK_RESEARCH_POLL_MS = 3000;

export type StockResearchStatus =
  | "PENDING"
  | "RUNNING"
  | "RERUNNING"
  | "COMPLETED"
  | "FAILED";

export type SerializedStockResearch = {
  id: string;
  assetType: ResearchAssetType;
  companyName: string | null;
  symbol: string | null;
  exchange: string | null;
  instrumentKey: string | null;
  /** What the user typed. */
  userPrompt: string | null;
  /** Enhanced research brief (equals the user prompt until enhancement runs). */
  query: string;
  status: StockResearchStatus;
  reportMarkdown: string | null;
  error: string | null;
  loadingLogs: string[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type SerializedStockResearchResource = {
  id: string;
  provider: string;
  type: string;
  title: string | null;
  url: string | null;
  source: string | null;
  tool: string | null;
};

export type StockResearchDetailPayload = {
  stockResearch: SerializedStockResearch;
  resources: SerializedStockResearchResource[];
};

export type StockResearchListPayload = {
  stockResearches: SerializedStockResearch[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
};

export function isStockResearchInProgress(status: StockResearchStatus): boolean {
  return status === "PENDING" || status === "RUNNING" || status === "RERUNNING";
}

export function formatStockResearchStatusLabel(status: StockResearchStatus): string {
  switch (status) {
    case "PENDING":
      return "Queued";
    case "RUNNING":
    case "RERUNNING":
      return "Researching";
    case "COMPLETED":
      return "Complete";
    case "FAILED":
      return "Failed";
  }
}

export function formatStockResearchTitle(row: SerializedStockResearch): string {
  const name = row.companyName ?? row.symbol ?? "Stock research";
  return row.symbol && row.companyName ? `${name} (${row.symbol})` : name;
}

export type ResearchAssetType = "STOCK" | "ETF" | "MUTUAL_FUND";

export const RESEARCH_ASSET_TYPES: readonly ResearchAssetType[] = [
  "STOCK",
  "ETF",
  "MUTUAL_FUND",
];

/** Per-asset UI config: copy, routes and the suggestion endpoint. */
export const RESEARCH_ASSET_CONFIG: Record<
  ResearchAssetType,
  {
    label: string;
    title: string;
    description: string;
    basePath: string;
    suggestPath: string;
    searchPlaceholder: string;
    promptPlaceholder: (name: string) => string;
  }
> = {
  STOCK: {
    label: "stock",
    title: "Stock research",
    description:
      "Pick a stock, tell us what you want to know, and we'll pull market data, fundamentals and recent coverage into one report.",
    basePath: "/stockResearch",
    suggestPath: "/api/instruments/suggest?segment=NSE_EQ",
    searchPlaceholder: "Search a stock by name or symbol…",
    promptPlaceholder: (name) =>
      `e.g. Should I invest in ${name} for the next 2–3 years? How are its valuation and recent results?`,
  },
  ETF: {
    label: "ETF",
    title: "ETF research",
    description:
      "Pick an ETF, tell us what you want to know, and we'll pull prices, tracking and cost details and recent coverage into one report.",
    basePath: "/etfResearch",
    suggestPath: "/api/instruments/etfs/suggest",
    searchPlaceholder: "Search an ETF by name or symbol (e.g. NIFTYBEES)…",
    promptPlaceholder: (name) =>
      `e.g. Is ${name} a good core holding? How do its costs, tracking and liquidity compare with similar ETFs?`,
  },
  MUTUAL_FUND: {
    label: "mutual fund",
    title: "Mutual fund research",
    description:
      "Pick a listed mutual fund, tell us what you want to know, and we'll pull prices, portfolio and cost details and recent coverage into one report.",
    basePath: "/MfResearch",
    suggestPath: "/api/instruments/mutual-funds/suggest",
    searchPlaceholder: "Search a mutual fund by name…",
    promptPlaceholder: (name) =>
      `e.g. Is ${name} suitable for a 5-year SIP? How has it performed against its category and benchmark?`,
  },
};
