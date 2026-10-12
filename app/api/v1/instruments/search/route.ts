import { endpoints } from "@/lib/api/v1/contract";
import { apiRoute } from "@/lib/api/v1/handler";
import {
  searchEtfsByNameOrShortName,
  searchInstrumentsByNameOrShortName,
  searchMutualFundsByNameOrShortName,
} from "@/repositories/instrument";

type Row = Awaited<ReturnType<typeof searchInstrumentsByNameOrShortName>>[number];

async function searchStocks(query: string, exchange: "NSE" | "BSE" | undefined, limit: number) {
  const segments = exchange ? [`${exchange}_EQ`] : ["NSE_EQ", "BSE_EQ"];
  const pages = await Promise.all(
    segments.map((segment) => searchInstrumentsByNameOrShortName({ query, segment, limit })),
  );
  // Ranked per segment; NSE first, then BSE listings not already seen.
  const seen = new Set<string>();
  const out: Row[] = [];
  for (const row of pages.flat()) {
    if (seen.has(row.instrumentKey)) continue;
    seen.add(row.instrumentKey);
    out.push(row);
  }
  return out.slice(0, limit);
}

export const GET = apiRoute(endpoints.searchInstruments, async ({ query }) => {
  const segment = query.exchange ? (`${query.exchange}_EQ` as const) : undefined;
  const rows: Row[] =
    query.type === "etf"
      ? await searchEtfsByNameOrShortName({ query: query.q, segment, limit: query.limit })
      : query.type === "mutual_fund"
        ? await searchMutualFundsByNameOrShortName({ query: query.q, segment, limit: query.limit })
        : await searchStocks(query.q, query.exchange, query.limit);

  return {
    data: rows.map((row) => ({
      instrumentKey: row.instrumentKey,
      name: row.name,
      shortName: row.shortName,
      tradingSymbol: row.tradingSymbol,
      exchange: row.exchange,
      segment: row.segment,
      instrumentType: row.instrumentType,
      isin: row.isin,
    })),
  };
});
