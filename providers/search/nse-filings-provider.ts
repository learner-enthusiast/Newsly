import type { SearchQueryRequest } from "@/providers/search-provider";
import type { SearchHit } from "@/providers/search-provider";
import { SearchProviderError } from "@/providers/search/retry";
import { withSearchRetries } from "@/providers/search/retry";

function formatNseDate(date: Date) {
  const day = String(date.getUTCDate()).padStart(2, "0");
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const year = date.getUTCFullYear();
  return `${day}-${month}-${year}`;
}

function resolveDateRange(request: SearchQueryRequest) {
  const start =
    request.metadata?.startDate instanceof Date
      ? request.metadata.startDate
      : typeof request.metadata?.startDate === "string"
        ? new Date(request.metadata.startDate)
        : undefined;
  const end =
    request.metadata?.endDate instanceof Date
      ? request.metadata.endDate
      : typeof request.metadata?.endDate === "string"
        ? new Date(request.metadata.endDate)
        : undefined;

  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    throw new SearchProviderError("NSE filings require startDate and endDate metadata", {
      transient: false,
    });
  }

  return { start, end };
}

function extractRows(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(
      (row): row is Record<string, unknown> =>
        Boolean(row) && typeof row === "object",
    );
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["data", "items", "results"]) {
      if (Array.isArray(record[key])) {
        return extractRows(record[key]);
      }
    }
  }
  return [];
}

export const nseFilingsProvider = {
  name: "NSE",

  async search(request: SearchQueryRequest): Promise<SearchHit[]> {
    const { start, end } = resolveDateRange(request);
    const fromDate = formatNseDate(start);
    const toDate = formatNseDate(end);

    const url = `https://www.nseindia.com/api/corporates-corporateActions?index=equities&from_date=${encodeURIComponent(fromDate)}&to_date=${encodeURIComponent(toDate)}`;

    const json = await withSearchRetries(async () => {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.nseindia.com/",
          "User-Agent":
            "Mozilla/5.0 (compatible; NewsIntelligenceBot/1.0; +https://localhost)",
        },
      });

      if (response.status === 429 || response.status >= 500) {
        throw new SearchProviderError(`NSE API HTTP ${response.status}`, {
          transient: true,
          statusCode: response.status,
        });
      }

      if (!response.ok) {
        throw new SearchProviderError(`NSE API HTTP ${response.status}`, {
          transient: false,
          statusCode: response.status,
        });
      }

      return response.json() as Promise<unknown>;
    });

    const rows = extractRows(json);
    const hits: SearchHit[] = [];

    for (const [index, row] of rows.entries()) {
      const link =
        (typeof row.link === "string" && row.link) ||
        (typeof row.url === "string" && row.url) ||
        (typeof row.attchmntFile === "string" &&
          `https://www.nseindia.com${row.attchmntFile}`) ||
        (typeof row.an_dt === "string"
          ? `https://www.nseindia.com/companies-listing/corporate-filings-announcements`
          : undefined);

      if (!link) {
        continue;
      }

      const title =
        typeof row.subject === "string"
          ? row.subject
          : typeof row.comp === "string"
            ? row.comp
            : typeof row.symbol === "string"
              ? `${row.symbol} corporate action`
              : "NSE corporate filing";

      hits.push({
        url: link,
        title,
        snippet:
          typeof row.desc === "string"
            ? row.desc
            : typeof row.an_dt === "string"
              ? row.an_dt
              : undefined,
        position: index,
        publishedAt:
          typeof row.an_dt === "string" ? new Date(row.an_dt) : undefined,
        raw: { source: "nse_corporate_actions", ...row },
      });
    }

    return hits;
  },
};
