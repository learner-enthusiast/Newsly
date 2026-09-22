import type { Region } from "@/db/generated/client";
import type { SearchExecutionInput } from "@/domain/news/schemas/discovery";

export type SearchHit = {
  url: string;
  title?: string;
  snippet?: string;
  position?: number;
  publishedAt?: Date;
  raw?: Record<string, unknown>;
};

export type SearchQueryRequest = SearchExecutionInput;

/** External search API port (SerpAPI, NSE, BSE). Not the Prisma `SearchProvider` enum. */
export interface SearchProvider {
  readonly name: string;
  search(request: SearchQueryRequest): Promise<SearchHit[]>;
}

export type SearchProviderFactory = (
  provider: SearchQueryRequest["provider"],
) => SearchProvider;

export function regionTargetsForRequest(
  requested: "INDIA" | "WORLD" | "BOTH",
): Region[] {
  if (requested === "BOTH") {
    return ["INDIA", "WORLD"];
  }
  return [requested];
}
