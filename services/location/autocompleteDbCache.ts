import { getLogger } from "@/clients/logger";
import { prisma } from "@/db/client";
import {
  autocompleteCacheExpiresAt,
  autocompletePrefixQueries,
  AUTOCOMPLETE_HL,
  buildAutocompleteDbProvider,
  coarseAutocompleteGeoKey,
  filterCachedSuggestionsForQuery,
  MIN_AUTOCOMPLETE_QUERY_LENGTH,
  MIN_PREFIX_FILTERED_RESULTS,
  normalizeAutocompleteQuery,
} from "@/services/location/autocompleteQuery";
import { searchLocationAutocomplete } from "@/services/location/mapsAutocomplete";
import type { LocationAutocompleteSuggestion } from "@/services/location/userLocationTypes";
import { z } from "zod";

const suggestionSchema = z.looseObject({
  value: z.string(),
  subtext: z.string().optional(),
  type: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
  data_id: z.string().optional(),
  serpapi_link: z.string().optional(),
  maps_serpapi_link: z.string().optional(),
  reviews_serpapi_link: z.string().optional(),
  photos_serpapi_link: z.string().optional(),
});

const storedResponseSchema = z.array(suggestionSchema);

const inFlight = new Map<string, Promise<LocationAutocompleteSuggestion[]>>();

function logDbCacheEvent(event: string, detail: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  getLogger().debug({ event, ...detail }, "location autocomplete db cache");
}

function parseStoredSuggestions(response: unknown): LocationAutocompleteSuggestion[] {
  const parsed = storedResponseSchema.safeParse(response);
  if (!parsed.success) {
    return [];
  }
  return parsed.data;
}

async function readExactDbCache(
  provider: string,
  normalizedQuery: string,
): Promise<{
  results: LocationAutocompleteSuggestion[];
  fresh: boolean;
} | null> {
  const row = await prisma.searchAutocompleteCache.findUnique({
    where: {
      provider_query: {
        provider,
        query: normalizedQuery,
      },
    },
  });
  if (!row) {
    return null;
  }
  const results = parseStoredSuggestions(row.response);
  if (results.length === 0) {
    return null;
  }
  return {
    results,
    fresh: row.expiresAt.getTime() > Date.now(),
  };
}

async function readPrefixDbCache(
  provider: string,
  normalizedQuery: string,
): Promise<LocationAutocompleteSuggestion[] | null> {
  for (const prefixQuery of autocompletePrefixQueries(normalizedQuery)) {
    const row = await prisma.searchAutocompleteCache.findUnique({
      where: {
        provider_query: {
          provider,
          query: prefixQuery,
        },
      },
    });
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      continue;
    }
    const filtered = filterCachedSuggestionsForQuery(
      parseStoredSuggestions(row.response),
      normalizedQuery,
    );
    if (filtered.length >= MIN_PREFIX_FILTERED_RESULTS) {
      logDbCacheEvent("AUTOCOMPLETE_DB_PREFIX_CACHE_HIT", {
        prefixLength: prefixQuery.length,
        queryLength: normalizedQuery.length,
        resultCount: filtered.length,
      });
      return filtered;
    }
  }
  return null;
}

async function upsertDbCache(
  provider: string,
  normalizedQuery: string,
  results: LocationAutocompleteSuggestion[],
) {
  await prisma.searchAutocompleteCache.upsert({
    where: {
      provider_query: {
        provider,
        query: normalizedQuery,
      },
    },
    create: {
      provider,
      query: normalizedQuery,
      response: results,
      expiresAt: autocompleteCacheExpiresAt(),
    },
    update: {
      response: results,
      expiresAt: autocompleteCacheExpiresAt(),
    },
  });
}

async function resolveFromSerpAndPersist(input: {
  trimmedQuery: string;
  normalizedQuery: string;
  provider: string;
  latitude?: number;
  longitude?: number;
  cp?: number;
}): Promise<LocationAutocompleteSuggestion[]> {
  const results = await searchLocationAutocomplete({
    q: input.trimmedQuery,
    latitude: input.latitude,
    longitude: input.longitude,
    cp: input.cp,
  });
  await upsertDbCache(input.provider, input.normalizedQuery, results);
  return results;
}

/**
 * Persistent Postgres cache for Serp Google Maps autocomplete (shared across users).
 */
export async function fetchLocationAutocompleteFromDbCache(input: {
  q: string;
  latitude?: number;
  longitude?: number;
  cp?: number;
}): Promise<LocationAutocompleteSuggestion[]> {
  const trimmedQuery = input.q.trim();
  const normalizedQuery = normalizeAutocompleteQuery(trimmedQuery);
  if (normalizedQuery.length < MIN_AUTOCOMPLETE_QUERY_LENGTH) {
    return [];
  }

  const geoKey = coarseAutocompleteGeoKey(input.latitude, input.longitude);
  const provider = buildAutocompleteDbProvider(geoKey);
  const inFlightKey = `${provider}:${normalizedQuery}`;

  let staleExactFallback: LocationAutocompleteSuggestion[] | null = null;

  const exact = await readExactDbCache(provider, normalizedQuery);
  if (exact?.fresh) {
    logDbCacheEvent("AUTOCOMPLETE_DB_EXACT_CACHE_HIT", {
      geoKey,
      queryLength: normalizedQuery.length,
    });
    return exact.results;
  }
  if (exact && !exact.fresh) {
    staleExactFallback = exact.results;
  }

  const prefixResults = await readPrefixDbCache(provider, normalizedQuery);
  if (prefixResults) {
    return prefixResults;
  }

  const pending = inFlight.get(inFlightKey);
  if (pending) {
    logDbCacheEvent("AUTOCOMPLETE_DB_REQUEST_DEDUPED", {
      geoKey,
      queryLength: normalizedQuery.length,
    });
    return pending;
  }

  logDbCacheEvent("AUTOCOMPLETE_EXTERNAL_REQUEST", {
    geoKey,
    queryLength: normalizedQuery.length,
    hl: AUTOCOMPLETE_HL,
  });

  const promise = resolveFromSerpAndPersist({
    trimmedQuery,
    normalizedQuery,
    provider,
    latitude: input.latitude,
    longitude: input.longitude,
    cp: input.cp,
  })
    .catch(async (error) => {
      if (staleExactFallback && staleExactFallback.length > 0) {
        logDbCacheEvent("AUTOCOMPLETE_DB_STALE_FALLBACK", {
          geoKey,
          queryLength: normalizedQuery.length,
        });
        return staleExactFallback;
      }
      throw error;
    })
    .finally(() => {
      inFlight.delete(inFlightKey);
    });

  inFlight.set(inFlightKey, promise);
  return promise;
}

/** Optional maintenance: delete rows expired beyond retention (days). */
export async function purgeExpiredAutocompleteCache(retentionDays = 30) {
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - retentionDays);
  await prisma.searchAutocompleteCache.deleteMany({
    where: {
      expiresAt: {
        lt: cutoff,
      },
    },
  });
}
