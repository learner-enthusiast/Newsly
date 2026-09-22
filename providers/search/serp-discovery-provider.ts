import type { DiscoveryPeriod, SearchType } from "@/db/generated/client";
import { serpClient } from "@/clients/serpCleint";
import type { SearchHit } from "@/providers/search-provider";
import type { SearchQueryRequest } from "@/providers/search-provider";
import { throttleSerpApi } from "@/providers/search/rate-limit";
import { SearchProviderError } from "@/providers/search/retry";
import { serpJsonToSearchHits } from "@/providers/search/serp-hits";

function periodToTbs(period: DiscoveryPeriod | undefined): string | undefined {
  switch (period) {
    case "DAY":
      return "qdr:d";
    case "WEEK":
      return "qdr:w";
    case "MONTH":
      return "qdr:m";
    default:
      return undefined;
  }
}

function engineForSearchType(searchType: SearchType) {
  switch (searchType) {
    case "GOOGLE_NEWS":
      return "google_news";
    case "GOOGLE_FINANCE":
      return "google_finance";
    case "GOOGLE_SEARCH":
      return "google";
    default:
      throw new SearchProviderError(
        `SerpAPI provider does not support search type ${searchType}`,
        { transient: false },
      );
  }
}

function regionParams(region: SearchQueryRequest["region"]) {
  if (region === "INDIA") {
    return { gl: "in", hl: "en", location: "India" };
  }
  return { gl: "us", hl: "en", location: "United States" };
}

export const serpDiscoveryProvider = {
  name: "SERPAPI",

  async search(request: SearchQueryRequest): Promise<SearchHit[]> {
    if (!request.query) {
      throw new SearchProviderError("SerpAPI search requires a query", {
        transient: false,
      });
    }

    const period =
      typeof request.metadata?.period === "string"
        ? (request.metadata.period as DiscoveryPeriod)
        : undefined;
    const tbs = periodToTbs(period);
    const engine = engineForSearchType(request.searchType);
    const regional = regionParams(request.region);

    await throttleSerpApi();

    try {
      const json = await serpClient.search({
        engine,
        q: request.query,
        num: request.region === "WORLD" ? 10 : 8,
        ...regional,
        ...(tbs && engine === "google" ? { tbs } : {}),
      });

      const record =
        json && typeof json === "object"
          ? (json as Record<string, unknown>)
          : {};

      if (record.error && typeof record.error === "string") {
        throw new SearchProviderError(record.error, {
          transient: record.error.toLowerCase().includes("timeout"),
        });
      }

      return serpJsonToSearchHits(record);
    } catch (error) {
      if (error instanceof SearchProviderError) {
        throw error;
      }
      throw new SearchProviderError(
        error instanceof Error ? error.message : "SerpAPI request failed",
        { transient: true, cause: error },
      );
    }
  },
};
