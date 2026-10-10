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
