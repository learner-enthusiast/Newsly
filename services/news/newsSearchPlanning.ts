import {
  buildNewsSearchQuery,
  type NewsSearchPlannerResult,
} from "@/Agents/news/searchPlanner";
import type { NewsScope } from "@/lib/newsScope";
import { DEFAULT_SERP_LOCATION_RADIUS_METERS } from "@/lib/serpLocationGeo";
import type { NewsGenerationConfig } from "@/services/news/newsGenerationRequest";
import { normalizeSerpApiLocation } from "@/services/chat/serpApiLocation";
import { z } from "zod";

export const newsSearchContextSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  scope: z.enum(["local", "world", "both"]),
  location: z.string().min(1).nullable().optional(),
  categories: z.array(z.string().min(1)).default([]),
  customQuery: z.string().min(1).nullable().optional(),
  language: z.string().min(1).optional(),
  sources: z.array(z.string().min(1)).default([]),
  serpHl: z.string().min(2).max(10).optional(),
  storyCount: z.number().int().min(1).max(12).optional(),
});

export type NewsSearchContext = z.infer<typeof newsSearchContextSchema>;

/** Canonical category → search keywords (combined into one query, not per-category API calls). */
export const NEWS_CATEGORY_KEYWORDS: Record<string, string[]> = {
  business: ["business", "companies", "corporate"],
  economy: ["economy", "economic", "GDP", "inflation"],
  technology: ["technology", "tech", "AI", "software"],
  policy: ["policy", "regulation", "government"],
  markets: ["stock market", "markets", "equities", "finance"],
  realestate: ["real estate", "property", "housing"],
  infrastructure: ["infrastructure", "roads", "metro", "transport"],
  startups: ["startups", "startup funding", "venture capital"],
  environment: ["environment", "climate", "pollution"],
  politics: ["politics", "government"],
  science: ["science", "research"],
  automotive: ["automotive", "cars", "EV"],
};

const CATEGORY_ALIAS: Record<string, keyof typeof NEWS_CATEGORY_KEYWORDS> = {
  business: "business",
  companies: "business",
  corporate: "business",
  economy: "economy",
  economic: "economy",
  technology: "technology",
  tech: "technology",
  policy: "policy",
  regulation: "policy",
  markets: "markets",
  market: "markets",
  finance: "markets",
  "real estate": "realestate",
  realestate: "realestate",
  property: "realestate",
  housing: "realestate",
  infrastructure: "infrastructure",
  transport: "infrastructure",
  startups: "startups",
  startup: "startups",
  environment: "environment",
  climate: "environment",
  politics: "politics",
  science: "science",
  automotive: "automotive",
  ev: "automotive",
};

export function expandCategoryKeywords(categories: string[]): string[] {
  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const raw of categories) {
    const normalized = raw.trim().toLowerCase().replace(/\s+/g, " ");
    if (!normalized) {
      continue;
    }
    const key =
      CATEGORY_ALIAS[normalized] ??
      (normalized in NEWS_CATEGORY_KEYWORDS
        ? (normalized as keyof typeof NEWS_CATEGORY_KEYWORDS)
        : undefined);
    const bucket = key ? NEWS_CATEGORY_KEYWORDS[key] : [raw.trim()];
    for (const term of bucket ?? []) {
      const token = term.trim();
      const dedupeKey = token.toLowerCase();
      if (!token || seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      keywords.push(token);
      if (keywords.length >= 12) {
        return keywords;
      }
    }
  }
  return keywords;
}

export function articleCandidateBudget(storyCount: number): number {
  return Math.min(40, Math.max(15, storyCount * 5));
}

export function serpResultsPerEngine(storyCount: number): number {
  return Math.min(30, Math.max(15, storyCount * 3));
}

export function maxArticlesToScrape(storyCount: number): number {
  return Math.min(20, Math.max(storyCount + 2, storyCount * 2));
}

export function newsSearchContextFromConfig(
  config: NewsGenerationConfig,
): NewsSearchContext {
  return newsSearchContextSchema.parse({
    date: config.date,
    scope: config.scope,
    location: config.location,
    categories: config.categories,
    customQuery: config.customQuery,
    language: config.language,
    sources: config.sources,
    serpHl: config.serpHl,
    storyCount: config.storyCount,
  });
}

function primaryPlaceLabel(location: string): string {
  return location.split(",")[0]?.trim() || location.trim();
}

/**
 * Geo params for Serp **Google Search** (`engine=google`, e.g. `tbm=nws` only).
 * `google_news` does not accept `lat`/`lon` — do not spread this onto `googleNewsParams`.
 */
export function buildSerpGoogleSearchGeoParams(
  config: Pick<
    NewsGenerationConfig,
    "latitude" | "longitude" | "location" | "locationRadiusMeters"
  >,
): Record<string, unknown> {
  if (config.latitude != null && config.longitude != null) {
    const radius =
      config.locationRadiusMeters ?? DEFAULT_SERP_LOCATION_RADIUS_METERS;
    return {
      lat: config.latitude,
      lon: config.longitude,
      // radius,
    };
  }
  if (config.location?.trim()) {
    return { location: normalizeSerpApiLocation(config.location) };
  }
  return {};
}

export function pickSerpSharedGeoFromSearchParams(
  params: Record<string, unknown>,
): Record<string, unknown> {
  if (typeof params.lat === "number" && typeof params.lon === "number") {
    return {
      lat: params.lat,
      lon: params.lon,
      ...(typeof params.radius === "number" ? { radius: params.radius } : {}),
    };
  }
  if (typeof params.location === "string" && params.location.length > 0) {
    return { location: params.location };
  }
  return {};
}

function buildSourceSiteFilter(sources: string[]): string | null {
  if (sources.length === 0) {
    return null;
  }
  if (sources.length === 1) {
    return `site:${sources[0]}`;
  }
  return `(${sources.map((domain) => `site:${domain}`).join(" OR ")})`;
}

/** Structured Google query from context (single combined strategy). */
export function buildGoogleQueryFromContext(
  ctx: NewsSearchContext,
  tier: "local" | "world",
  channel: "news" | "search",
): string {
  const base = buildNewsSearchQuery({
    type: tier === "local" ? "LOCAL" : "WORLD",
    location: tier === "local" ? (ctx.location ?? undefined) : undefined,
    date: ctx.date,
    channel,
  });

  const parts: string[] = [];

  if (tier === "local" && ctx.location && channel === "search") {
    parts.push(
      `${primaryPlaceLabel(ctx.location)} stock market economy business news`,
    );
    parts.push(base.query.match(/after:.*before:.*/)?.[0] ?? "");
  } else if (tier === "local" && ctx.location && channel === "news") {
    parts.push(
      `${primaryPlaceLabel(ctx.location)} economy business news ${ctx.date}`,
    );
  } else {
    parts.push(base.query);
  }

  const categoryKeywords = expandCategoryKeywords(ctx.categories);
  if (categoryKeywords.length > 0) {
    parts.push(categoryKeywords.slice(0, 8).join(" "));
  }

  if (ctx.customQuery?.trim()) {
    parts.push(ctx.customQuery.trim());
  }

  const siteFilter = buildSourceSiteFilter(ctx.sources);
  if (siteFilter) {
    parts.push(siteFilter);
  }

  return parts
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export type NewsSearchExecutionPlan = {
  tier: "local" | "world";
  news: NewsSearchPlannerResult;
  search: NewsSearchPlannerResult;
  /** SerpAPI params for google_news */
  googleNewsParams: Record<string, unknown>;
  /** SerpAPI params for google + tbm nws */
  googleSearchParams: Record<string, unknown>;
  youtubeParams: Record<string, unknown>;
};

function plannerShell(
  query: string,
  channel: "news" | "search",
  gl: string | undefined,
  hl: string,
): NewsSearchPlannerResult {
  return {
    query,
    channel,
    suggestedGl: gl,
    suggestedHl: hl,
    input: {
      type: "WORLD",
      date: "1970-01-01",
      channel,
    },
  };
}

export function buildNewsSearchExecutionPlans(
  config: NewsGenerationConfig,
): NewsSearchExecutionPlan[] {
  const ctx = newsSearchContextFromConfig(config);
  const hl = ctx.serpHl ?? config.serpHl;
  const num = serpResultsPerEngine(config.storyCount);

  const tiers: Array<{ tier: "local" | "world"; location: string | null }> =
    config.scope === "both"
      ? [
          { tier: "local", location: config.location },
          { tier: "world", location: null },
        ]
      : config.scope === "local"
        ? [{ tier: "local", location: config.location }]
        : [{ tier: "world", location: null }];

  return tiers.map(({ tier, location }) => {
    const tierCtx: NewsSearchContext = {
      ...ctx,
      location,
    };
    const basePlanner = buildNewsSearchQuery({
      type: tier === "local" ? "LOCAL" : "WORLD",
      location: location ?? undefined,
      date: config.date,
      channel: "news",
    });
    const gl = basePlanner.suggestedGl;

    const newsQuery = buildGoogleQueryFromContext(tierCtx, tier, "news");
    const searchQuery = buildGoogleQueryFromContext(tierCtx, tier, "search");

    const googleSearchGeo =
      tier === "local"
        ? buildSerpGoogleSearchGeoParams({
            latitude: config.latitude,
            longitude: config.longitude,
            location,
            locationRadiusMeters: config.locationRadiusMeters,
          })
        : {};

    return {
      tier,
      news: {
        ...plannerShell(newsQuery, "news", gl, hl),
        input: {
          type: tier === "local" ? "LOCAL" : "WORLD",
          location: location ?? undefined,
          date: config.date,
          channel: "news",
        },
      },
      search: {
        ...plannerShell(searchQuery, "search", gl, hl),
        input: {
          type: tier === "local" ? "LOCAL" : "WORLD",
          location: location ?? undefined,
          date: config.date,
          channel: "search",
        },
      },
      /** `engine=google_news`: q + gl/hl only (no lat/lon/location). */
      googleNewsParams: {
        q: newsQuery,
        num,
        hl,
        ...(gl ? { gl } : {}),
      },
      googleSearchParams: {
        q: searchQuery,
        tbm: "nws",
        num,
        hl,
        ...(gl ? { gl } : {}),
        ...googleSearchGeo,
      },
      youtubeParams: {
        search_query: searchQuery,
        hl,
        ...(gl ? { gl } : {}),
      },
    };
  });
}

/** @deprecated alias for pipeline save step */
export type NewsSearchPlanPair = Pick<
  NewsSearchExecutionPlan,
  "news" | "search" | "tier"
>;

export function buildNewsSearchPlanPairs(
  config: NewsGenerationConfig,
): NewsSearchPlanPair[] {
  return buildNewsSearchExecutionPlans(config).map((plan) => ({
    tier: plan.tier,
    news: plan.news,
    search: plan.search,
  }));
}

export function buildArticleSelectionPrompt(
  config: NewsGenerationConfig,
): string {
  const categoryHint =
    config.categories.length > 0
      ? ` Focus on categories: ${config.categories.join(", ")}.`
      : "";
  const sourceHint =
    config.sources.length > 0
      ? ` Preferred publisher domains: ${config.sources.join(", ")} (still verify relevance).`
      : "";

  let scopeLine: string;
  if (config.scope === "local" && config.location) {
    scopeLine = `Select articles for stock-market and economic news relevant to ${config.location} on ${config.date}.`;
  } else if (config.scope === "both" && config.location) {
    scopeLine = `Select a mix of ${config.location}-relevant and global stock-market/economic news for ${config.date}.`;
  } else {
    scopeLine = `Select global stock-market and economic news for ${config.date}.`;
  }

  return [
    scopeLine + categoryHint + sourceHint,
    "Judge geographic relevance from the article (LOCAL, REGIONAL, NATIONAL, GLOBAL).",
    "Do not treat every national or global policy story as local merely because the request mentions a city.",
    config.customQuery ? `User emphasis: ${config.customQuery}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function preferArticlesFromSources<T extends { url: string }>(
  articles: T[],
  sources: string[],
): T[] {
  if (sources.length === 0) {
    return articles;
  }
  const preferred: T[] = [];
  const other: T[] = [];
  for (const article of articles) {
    try {
      const host = new URL(article.url).hostname
        .replace(/^www\./, "")
        .toLowerCase();
      const match = sources.some(
        (domain) => host === domain || host.endsWith(`.${domain}`),
      );
      (match ? preferred : other).push(article);
    } catch {
      other.push(article);
    }
  }
  return [...preferred, ...other];
}
