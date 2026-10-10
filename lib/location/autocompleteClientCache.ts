import {
  buildClientAutocompleteCacheKey,
  CLIENT_CACHE_TTL_MS,
  filterCachedSuggestionsForQuery,
  MAX_CLIENT_CACHE_ENTRIES,
  MIN_PREFIX_FILTERED_RESULTS,
  normalizeAutocompleteQuery,
} from "@/services/location/autocompleteQuery";
import type { LocationAutocompleteSuggestion } from "@/services/location/userLocationTypes";

type ClientCacheEntry = {
  results: LocationAutocompleteSuggestion[];
  expiresAt: number;
  lastAccess: number;
};

const clientCache = new Map<string, ClientCacheEntry>();

function touchEntry(key: string, entry: ClientCacheEntry) {
  clientCache.delete(key);
  entry.lastAccess = Date.now();
  clientCache.set(key, entry);
}

function readEntry(key: string, touch: boolean): ClientCacheEntry | null {
  const entry = clientCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    clientCache.delete(key);
    return null;
  }
  if (touch) {
    touchEntry(key, entry);
  }
  return entry;
}

function pruneClientCache() {
  while (clientCache.size > MAX_CLIENT_CACHE_ENTRIES) {
    const oldestKey = clientCache.keys().next().value;
    if (typeof oldestKey !== "string") {
      break;
    }
    clientCache.delete(oldestKey);
  }
}

function logClientCacheEvent(event: string, detail: Record<string, unknown>) {
  if (process.env.NODE_ENV !== "development") {
    return;
  }
  console.debug(`[${event}]`, detail);
}

function peekPrefixClientAutocompleteCache(
  geoKey: string,
  normalizedQuery: string,
): LocationAutocompleteSuggestion[] | null {
  let bestPrefix: string | null = null;
  let bestEntry: ClientCacheEntry | null = null;

  for (const [key, entry] of clientCache.entries()) {
    if (entry.expiresAt <= Date.now()) {
      clientCache.delete(key);
      continue;
    }
    if (!key.startsWith(`${geoKey}:`)) {
      continue;
    }
    const cachedQuery = key.slice(geoKey.length + 1);
    if (
      cachedQuery.length >= normalizedQuery.length ||
      !normalizedQuery.startsWith(cachedQuery)
    ) {
      continue;
    }
    if (!bestPrefix || cachedQuery.length > bestPrefix.length) {
      bestPrefix = cachedQuery;
      bestEntry = entry;
    }
  }

  if (!bestPrefix || !bestEntry) {
    return null;
  }

  const filtered = filterCachedSuggestionsForQuery(
    bestEntry.results,
    normalizedQuery,
  );
  if (filtered.length < MIN_PREFIX_FILTERED_RESULTS) {
    return null;
  }

  return filtered;
}

export function peekClientAutocompleteResolution(
  geoKey: string,
  normalizedQuery: string,
): LocationAutocompleteSuggestion[] | null {
  const exactKey = buildClientAutocompleteCacheKey(geoKey, normalizedQuery);
  const exactEntry = readEntry(exactKey, false);
  if (exactEntry) {
    logClientCacheEvent("AUTOCOMPLETE_CLIENT_CACHE_HIT", {
      geoKey,
      queryLength: normalizedQuery.length,
    });
    readEntry(exactKey, true);
    return exactEntry.results;
  }

  const prefix = peekPrefixClientAutocompleteCache(geoKey, normalizedQuery);
  if (prefix) {
    logClientCacheEvent("AUTOCOMPLETE_PREFIX_CACHE_HIT", {
      geoKey,
      queryLength: normalizedQuery.length,
      resultCount: prefix.length,
    });
    return prefix;
  }

  return null;
}

export function setClientAutocompleteCache(
  geoKey: string,
  rawQuery: string,
  results: LocationAutocompleteSuggestion[],
) {
  const normalizedQuery = normalizeAutocompleteQuery(rawQuery);
  if (normalizedQuery.length < 1) {
    return;
  }
  const key = buildClientAutocompleteCacheKey(geoKey, normalizedQuery);
  const now = Date.now();
  clientCache.set(key, {
    results,
    expiresAt: now + CLIENT_CACHE_TTL_MS,
    lastAccess: now,
  });
  touchEntry(key, clientCache.get(key)!);
  pruneClientCache();
}
