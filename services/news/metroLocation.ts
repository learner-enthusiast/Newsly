import type { NewsMetro } from "@/db/generated/client";
import {
  findNearestNewsMetro,
  findNewsMetroByExactNameOrAlias,
  searchNewsMetros,
} from "@/repositories/newsMetro";
import {
  formatNewsMetroLabel,
  localNewsParamsForMetro,
} from "@/services/news/metroHelpers";

export { formatNewsMetroLabel, localNewsParamsForMetro };

export type SerializedNewsMetro = {
  id: string;
  name: string;
  aliases: string[];
  country: string;
  countryCode: string;
  region: string;
  latitude: number;
  longitude: number;
  timezone: string;
  lang: string;
  /** Stored on news requests (city + country). */
  label: string;
};

export function serializeNewsMetro(metro: NewsMetro): SerializedNewsMetro {
  return {
    id: metro.id,
    name: metro.name,
    aliases: metro.aliases,
    country: metro.country,
    countryCode: metro.countryCode,
    region: metro.region,
    latitude: metro.latitude,
    longitude: metro.longitude,
    timezone: metro.timezone,
    lang: metro.lang,
    label: formatNewsMetroLabel(metro),
  };
}

/** Match free text to a metro by exact name, alias, or stored label prefix. */
export async function resolveNewsMetroFromLocationText(
  location: string,
): Promise<SerializedNewsMetro | null> {
  const trimmed = location.trim();
  if (!trimmed) {
    return null;
  }

  const exact = await findNewsMetroByExactNameOrAlias(trimmed);
  if (exact) {
    return serializeNewsMetro(exact);
  }

  const primary = trimmed.split(",")[0]?.trim() ?? trimmed;
  if (primary !== trimmed) {
    const byPrimary = await findNewsMetroByExactNameOrAlias(primary);
    if (byPrimary) {
      return serializeNewsMetro(byPrimary);
    }
  }

  const hits = await searchNewsMetros({ query: primary, limit: 1 });
  const first = hits[0];
  if (!first) {
    return null;
  }
  return serializeNewsMetro(first);
}

export async function resolveCoordsFromNewsMetroLocation(
  location: string,
): Promise<{ latitude: number; longitude: number } | null> {
  const metro = await resolveNewsMetroFromLocationText(location);
  if (!metro) {
    return null;
  }
  return { latitude: metro.latitude, longitude: metro.longitude };
}

export async function resolveNearestSerializedNewsMetro(
  latitude: number,
  longitude: number,
  maxKm?: number,
): Promise<(SerializedNewsMetro & { distanceKm: number }) | null> {
  const hit = await findNearestNewsMetro({ latitude, longitude, maxKm });
  if (!hit) {
    return null;
  }
  return {
    ...serializeNewsMetro(hit.metro),
    distanceKm: hit.distanceKm,
  };
}
