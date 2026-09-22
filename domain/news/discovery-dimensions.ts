/** Discovery query dimensions — not ranking categories. */

export const INDIA_DISCOVERY_DIMENSIONS = [
  "major Indian companies",
  "Indian markets",
  "NSE",
  "BSE",
  "RBI",
  "SEBI",
  "banking",
  "NBFC",
  "IPO",
  "M&A",
  "corporate actions",
  "earnings",
  "insolvency",
  "regulation",
  "taxation",
  "macro",
  "interest rates",
  "INR",
  "commodities",
] as const;

export const WORLD_DISCOVERY_DIMENSIONS = [
  "US",
  "Europe",
  "China",
  "Japan",
  "Middle East",
  "Russia Ukraine",
  "central banks",
  "Federal Reserve",
  "ECB",
  "Bank of Japan",
  "oil",
  "gas",
  "gold",
  "commodities",
  "trade",
  "tariffs",
  "AI",
  "technology",
  "semiconductors",
  "global banks",
  "major corporations",
  "macro",
  "geopolitics",
  "currencies",
  "indices",
] as const;

export type IndiaDiscoveryDimension =
  (typeof INDIA_DISCOVERY_DIMENSIONS)[number];
export type WorldDiscoveryDimension =
  (typeof WORLD_DISCOVERY_DIMENSIONS)[number];
