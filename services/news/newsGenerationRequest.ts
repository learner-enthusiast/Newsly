import { newsScopeSchema } from "@/lib/newsScope";
import { newsSearchQuerySchema } from "@/lib/newsSearchQuerySchema";
import { DEFAULT_SERP_LOCATION_RADIUS_METERS } from "@/lib/serpLocationGeo";
import { z } from "zod";

export const DEFAULT_STORY_COUNT = 5;
export const MAX_STORY_COUNT = 12;
export const MAX_CATEGORIES = 10;
export const MAX_SOURCES = 10;
export const DEFAULT_LANGUAGE = "English";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD");

function normalizeTokenList(values: string[] | undefined, maxItems: number): string[] {
  if (!values?.length) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of values) {
    const trimmed = raw.trim().replace(/\s+/g, " ");
    if (!trimmed) {
      continue;
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    normalized.push(trimmed);
    if (normalized.length >= maxItems) {
      break;
    }
  }
  return normalized;
}

/** Normalize a domain or URL to a bare hostname for Serp `site:` filters. */
export function normalizeSourceDomain(raw: string): string | null {
  const trimmed = raw.trim().toLowerCase();
  if (!trimmed) {
    return null;
  }
  try {
    const withProtocol = trimmed.includes("://") ? trimmed : `https://${trimmed}`;
    const hostname = new URL(withProtocol).hostname.replace(/^www\./, "");
    return hostname.length > 0 ? hostname : null;
  } catch {
    const fallback = trimmed.replace(/^www\./, "").split("/")[0]?.trim();
    return fallback && fallback.includes(".") ? fallback : null;
  }
}

export function normalizeSourceDomains(values: string[] | undefined): string[] {
  const seen = new Set<string>();
  const domains: string[] = [];
  for (const raw of values ?? []) {
    const domain = normalizeSourceDomain(raw);
    if (!domain || seen.has(domain)) {
      continue;
    }
    seen.add(domain);
    domains.push(domain);
    if (domains.length >= MAX_SOURCES) {
      break;
    }
  }
  return domains;
}

const LANGUAGE_TO_HL: Record<string, string> = {
  english: "en",
  hindi: "hi",
  spanish: "es",
  french: "fr",
  german: "de",
  japanese: "ja",
  chinese: "zh-cn",
  portuguese: "pt",
  arabic: "ar",
};

export function resolveSerpHl(language: string | null | undefined): string {
  if (!language?.trim()) {
    return "en";
  }
  const key = language.trim().toLowerCase();
  if (LANGUAGE_TO_HL[key]) {
    return LANGUAGE_TO_HL[key]!;
  }
  if (/^[a-z]{2}(-[a-z]{2})?$/i.test(key)) {
    return key.toLowerCase();
  }
  return "en";
}

export const newsGenerationRequestSchema = z
  .object({
    date: isoDateSchema,
    scope: newsScopeSchema,
    location: z.string().min(1).optional(),
    categories: z.array(z.string().min(1).max(80)).max(MAX_CATEGORIES).optional(),
    customQuery: z.string().min(1).max(500).optional(),
    storyCount: z.number().int().min(1).max(MAX_STORY_COUNT).optional(),
    language: z.string().min(1).max(40).optional(),
    sources: z.array(z.string().min(1).max(200)).max(MAX_SOURCES).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    /** Serp `radius` in meters (optional; defaults when lat/lon are set). */
    radius: z.number().int().min(1).max(500_000).optional(),
  })
  .superRefine((data, ctx) => {
    const needsLocation = data.scope === "local" || data.scope === "both";
    if (needsLocation && !data.location?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "location is required when scope is local or both",
        path: ["location"],
      });
    }
    if (data.scope === "world" && data.location?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "location must not be set when scope is world",
        path: ["location"],
      });
    }
    const hasLatitude = data.latitude !== undefined;
    const hasLongitude = data.longitude !== undefined;
    if (hasLatitude !== hasLongitude) {
      ctx.addIssue({
        code: "custom",
        message: "latitude and longitude must be provided together",
        path: ["latitude"],
      });
    }
  });

export type NewsGenerationRequestInput = z.input<typeof newsGenerationRequestSchema>;

/** Normalized request used by API, DB, Inngest, and the pipeline. */
export const newsGenerationConfigSchema = z.object({
  date: isoDateSchema,
  scope: newsScopeSchema,
  location: z.string().min(1).nullable(),
  categories: z.array(z.string().min(1).max(80)),
  customQuery: z.string().min(1).max(500).nullable(),
  storyCount: z.number().int().min(1).max(MAX_STORY_COUNT),
  language: z.string().min(1).max(40),
  sources: z.array(z.string().min(1).max(200)),
  serpHl: z.string().min(2).max(10),
  latitude: z.number().min(-90).max(90).nullable(),
  longitude: z.number().min(-180).max(180).nullable(),
  locationRadiusMeters: z.number().int().positive().nullable(),
});

export type NewsGenerationConfig = z.infer<typeof newsGenerationConfigSchema>;

export function normalizeNewsGenerationRequest(
  input: NewsGenerationRequestInput,
): NewsGenerationConfig {
  const parsed = newsGenerationRequestSchema.parse(input);
  const language = parsed.language?.trim() || DEFAULT_LANGUAGE;
  const location =
    parsed.scope === "world"
      ? null
      : (parsed.location?.trim() ?? null);
  const latitude =
    parsed.scope === "world" ? null : (parsed.latitude ?? null);
  const longitude =
    parsed.scope === "world" ? null : (parsed.longitude ?? null);
  const locationRadiusMeters =
    parsed.scope === "world" || latitude == null || longitude == null
      ? null
      : (parsed.radius ?? DEFAULT_SERP_LOCATION_RADIUS_METERS);

  return newsGenerationConfigSchema.parse({
    date: parsed.date,
    scope: parsed.scope,
    location,
    latitude,
    longitude,
    locationRadiusMeters,
    categories: normalizeTokenList(parsed.categories, MAX_CATEGORIES),
    customQuery: parsed.customQuery?.trim() || null,
    storyCount: parsed.storyCount ?? DEFAULT_STORY_COUNT,
    language,
    sources: normalizeSourceDomains(parsed.sources),
    serpHl: resolveSerpHl(language),
  });
}

export function newsGenerationConfigFromNewsRequest(row: {
  date: Date;
  scope: z.infer<typeof newsScopeSchema>;
  location: string | null;
  categories?: string[] | null;
  customQuery?: string | null;
  storyCount?: number | null;
  language?: string | null;
  sources?: string[] | null;
  searchQuery?: unknown;
}): NewsGenerationConfig {
  const storedSearch = newsSearchQuerySchema.safeParse(row.searchQuery);
  const locationGeo = storedSearch.success
    ? storedSearch.data.locationGeo
    : undefined;

  return normalizeNewsGenerationRequest({
    date: row.date.toISOString().slice(0, 10),
    scope: row.scope,
    location: row.location ?? undefined,
    categories: row.categories ?? [],
    customQuery: row.customQuery ?? undefined,
    storyCount: row.storyCount ?? DEFAULT_STORY_COUNT,
    language: row.language ?? DEFAULT_LANGUAGE,
    sources: row.sources ?? [],
    latitude: locationGeo?.latitude,
    longitude: locationGeo?.longitude,
    radius: locationGeo?.radiusMeters,
  });
}

export const newsPipelineGenerationEventSchema = newsGenerationConfigSchema.pick({
  date: true,
  scope: true,
  location: true,
  latitude: true,
  longitude: true,
  locationRadiusMeters: true,
  categories: true,
  customQuery: true,
  storyCount: true,
  language: true,
  sources: true,
  serpHl: true,
});

export type NewsPipelineGenerationEvent = z.infer<
  typeof newsPipelineGenerationEventSchema
>;
