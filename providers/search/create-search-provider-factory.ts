import type { SearchProvider as DbSearchProvider } from "@/db/generated/client";
import type { SearchProviderFactory } from "@/providers/search-provider";
import { bseFilingsProvider } from "@/providers/search/bse-filings-provider";
import { nseFilingsProvider } from "@/providers/search/nse-filings-provider";
import { serpDiscoveryProvider } from "@/providers/search/serp-discovery-provider";
import { SearchProviderError } from "@/providers/search/retry";

export function createNewsSearchProviderFactory(): SearchProviderFactory {
  return (provider: DbSearchProvider) => {
    switch (provider) {
      case "SERPAPI":
        return serpDiscoveryProvider;
      case "NSE":
        return nseFilingsProvider;
      case "BSE":
        return bseFilingsProvider;
      default:
        throw new SearchProviderError(`Unsupported search provider: ${provider}`, {
          transient: false,
        });
    }
  };
}
