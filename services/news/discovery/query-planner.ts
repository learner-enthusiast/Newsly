import { createHash } from "node:crypto";
import type {
  DiscoveryPeriod,
  RequestRegion,
  SearchProvider,
  SearchType,
} from "@/db/generated/client";
import type { Region } from "@/db/generated/client";
import {
  INDIA_DISCOVERY_DIMENSIONS,
  WORLD_DISCOVERY_DIMENSIONS,
} from "@/domain/news/discovery-dimensions";
import { regionTargetsForRequest } from "@/providers/search-provider";

export type PlannedDiscoverySearch = {
  executionKey: string;
  discoveryRunId: string;
  region: Region;
  provider: SearchProvider;
  searchType: SearchType;
  query: string;
  dimension: string;
  period: DiscoveryPeriod;
  startDate: Date;
  endDate: Date;
  variantIndex: number;
};

const INDIA_SERP_TYPES: SearchType[] = [
  "GOOGLE_NEWS",
  "GOOGLE_FINANCE",
  "GOOGLE_SEARCH",
];

const WORLD_SERP_TYPES: SearchType[] = [
  "GOOGLE_NEWS",
  "GOOGLE_FINANCE",
  "GOOGLE_SEARCH",
];

function stableExecutionKey(parts: Record<string, string | number>) {
  const payload = Object.keys(parts)
    .sort()
    .map((key) => `${key}=${parts[key]}`)
    .join("|");
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

function formatRangeLabel(startDate: Date, endDate: Date) {
  return `${startDate.toISOString().slice(0, 10)}..${endDate.toISOString().slice(0, 10)}`;
}

function buildQueryText(input: {
  dimension: string;
  region: Region;
  period: DiscoveryPeriod;
  startDate: Date;
  endDate: Date;
  variantIndex: number;
  searchType: SearchType;
}) {
  const range = formatRangeLabel(input.startDate, input.endDate);
  const scope =
    input.region === "INDIA"
      ? "India"
      : "global markets world economy";
  const periodHint =
    input.period === "DAY"
      ? "today recent breaking"
      : input.period === "WEEK"
        ? "this week"
        : "this month";

  const financeHint =
    input.searchType === "GOOGLE_FINANCE" ? "markets stocks bonds" : "";
  const newsHint =
    input.searchType === "GOOGLE_NEWS" ? "news latest headlines" : "";

  const variantSuffix =
    input.variantIndex === 0
      ? ""
      : input.region === "WORLD"
        ? " analysis impact outlook"
        : " regulatory business impact";

  return [
    input.dimension,
    scope,
    periodHint,
    financeHint,
    newsHint,
    range,
    variantSuffix,
  ]
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function serpTasksForRegion(input: {
  discoveryRunId: string;
  region: Region;
  period: DiscoveryPeriod;
  startDate: Date;
  endDate: Date;
  dimensions: readonly string[];
  variantsPerDimension: number;
}): PlannedDiscoverySearch[] {
  const tasks: PlannedDiscoverySearch[] = [];
  const searchTypes =
    input.region === "INDIA" ? INDIA_SERP_TYPES : WORLD_SERP_TYPES;

  for (const dimension of input.dimensions) {
    for (let variantIndex = 0; variantIndex < input.variantsPerDimension; variantIndex++) {
      for (const searchType of searchTypes) {
        const query = buildQueryText({
          dimension,
          region: input.region,
          period: input.period,
          startDate: input.startDate,
          endDate: input.endDate,
          variantIndex,
          searchType,
        });

        const executionKey = stableExecutionKey({
          discoveryRunId: input.discoveryRunId,
          region: input.region,
          provider: "SERPAPI",
          searchType,
          dimension,
          variantIndex,
          query,
        });

        tasks.push({
          executionKey,
          discoveryRunId: input.discoveryRunId,
          region: input.region,
          provider: "SERPAPI",
          searchType,
          query,
          dimension,
          period: input.period,
          startDate: input.startDate,
          endDate: input.endDate,
          variantIndex,
        });
      }
    }
  }

  return tasks;
}

function filingTasks(input: {
  discoveryRunId: string;
  region: Region;
  period: DiscoveryPeriod;
  startDate: Date;
  endDate: Date;
}): PlannedDiscoverySearch[] {
  if (input.region !== "INDIA") {
    return [];
  }

  const range = formatRangeLabel(input.startDate, input.endDate);
  const providers: SearchProvider[] = ["NSE", "BSE"];

  return providers.map((provider) => {
    const query = `corporate_filings ${range}`;
    const executionKey = stableExecutionKey({
      discoveryRunId: input.discoveryRunId,
      region: input.region,
      provider,
      searchType: "CORPORATE_FILINGS",
      range,
    });

    return {
      executionKey,
      discoveryRunId: input.discoveryRunId,
      region: input.region,
      provider,
      searchType: "CORPORATE_FILINGS" as SearchType,
      query,
      dimension: "corporate filings",
      period: input.period,
      startDate: input.startDate,
      endDate: input.endDate,
      variantIndex: 0,
    };
  });
}

export function planDiscoverySearches(input: {
  discoveryRunId: string;
  requestRegion: RequestRegion;
  period: DiscoveryPeriod;
  startDate: Date;
  endDate: Date;
}): PlannedDiscoverySearch[] {
  const regions = regionTargetsForRequest(input.requestRegion);
  const tasks: PlannedDiscoverySearch[] = [];

  for (const region of regions) {
    const dimensions =
      region === "INDIA"
        ? INDIA_DISCOVERY_DIMENSIONS
        : WORLD_DISCOVERY_DIMENSIONS;
    const variantsPerDimension = region === "WORLD" ? 2 : 1;

    tasks.push(
      ...filingTasks({
        discoveryRunId: input.discoveryRunId,
        region,
        period: input.period,
        startDate: input.startDate,
        endDate: input.endDate,
      }),
    );

    tasks.push(
      ...serpTasksForRegion({
        discoveryRunId: input.discoveryRunId,
        region,
        period: input.period,
        startDate: input.startDate,
        endDate: input.endDate,
        dimensions,
        variantsPerDimension,
      }),
    );
  }

  return tasks;
}
