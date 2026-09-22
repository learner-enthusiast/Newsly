import type { SearchHit } from "@/providers/search-provider";
import type { SearchQueryRequest } from "@/providers/search-provider";
import { SearchProviderError } from "@/providers/search/retry";
import { withSearchRetries } from "@/providers/search/retry";

function formatBseDate(date: Date) {
  return date.toISOString().slice(0, 10);
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
    throw new SearchProviderError("BSE filings require startDate and endDate metadata", {
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
    if (Array.isArray(record.Table)) {
      return extractRows(record.Table);
    }
  }
  return [];
}

export const bseFilingsProvider = {
  name: "BSE",

  async search(request: SearchQueryRequest): Promise<SearchHit[]> {
    const { start, end } = resolveDateRange(request);
    const fromDate = formatBseDate(start);
    const toDate = formatBseDate(end);

    const url = `https://api.bseindia.com/BseIndiaAPI/api/AnnGetData/w?strCat=-1&strPrevDate=${fromDate}&strScrip=&strSearch=P&strToDate=${toDate}&strType=C`;

    const json = await withSearchRetries(async () => {
      const response = await fetch(url, {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://www.bseindia.com/",
          Origin: "https://www.bseindia.com",
          "User-Agent":
            "Mozilla/5.0 (compatible; NewsIntelligenceBot/1.0; +https://localhost)",
        },
      });

      if (response.status === 429 || response.status >= 500) {
        throw new SearchProviderError(`BSE API HTTP ${response.status}`, {
          transient: true,
          statusCode: response.status,
        });
      }

      if (!response.ok) {
        throw new SearchProviderError(`BSE API HTTP ${response.status}`, {
          transient: false,
          statusCode: response.status,
        });
      }

      return response.json() as Promise<unknown>;
    });

    const rows = extractRows(json);
    return rows
      .map((row, index) => {
        const newsId =
          typeof row.NEWSID === "string" || typeof row.NEWSID === "number"
            ? String(row.NEWSID)
            : undefined;
        const slug =
          typeof row.SLN === "string"
            ? row.SLN
            : typeof row.SCRIP_CD === "string"
              ? row.SCRIP_CD
              : undefined;

        const link = newsId
          ? `https://www.bseindia.com/stock-share-price/${slug ?? "x"}/${newsId}`
          : typeof row.URL === "string"
            ? row.URL
            : "https://www.bseindia.com/corporates/ann.html";

        const title =
          typeof row.HEADLINE === "string"
            ? row.HEADLINE
            : typeof row.NEWSSUB === "string"
              ? row.NEWSSUB
              : "BSE corporate announcement";

        return {
          url: link,
          title,
          snippet:
            typeof row.DT_TM === "string"
              ? row.DT_TM
              : typeof row.NEWS_DT === "string"
                ? row.NEWS_DT
                : undefined,
          position: index,
          publishedAt:
            typeof row.NEWS_DT === "string"
              ? new Date(row.NEWS_DT)
              : undefined,
          raw: { source: "bse_announcements", ...row },
        } satisfies SearchHit;
      })
      .filter((hit) => Boolean(hit.url));
  },
};
