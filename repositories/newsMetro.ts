import type { NewsMetro } from "@/db/generated/client";
import { prisma } from "@/db";
import { z } from "zod";

const searchSchema = z.object({
  query: z.string().min(1),
  limit: z.number().int().min(1).max(50).optional(),
});

const nearestSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  maxKm: z.number().positive().max(500).optional(),
});

export type NewsMetroSearchInput = z.input<typeof searchSchema>;
export type NewsMetroNearestInput = z.input<typeof nearestSchema>;

const METRO_CACHE_TTL_MS = 5 * 60 * 1000;
let metroCache: NewsMetro[] | null = null;
let metroCacheExpiresAt = 0;

async function loadAllNewsMetros(): Promise<NewsMetro[]> {
  if (metroCache && Date.now() < metroCacheExpiresAt) {
    return metroCache;
  }
  metroCache = await prisma.newsMetro.findMany({ orderBy: { name: "asc" } });
  metroCacheExpiresAt = Date.now() + METRO_CACHE_TTL_MS;
  return metroCache;
}

export function invalidateNewsMetroCache(): void {
  metroCache = null;
  metroCacheExpiresAt = 0;
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function metroMatchesPrefix(metro: NewsMetro, q: string): boolean {
  if (metro.name.toLowerCase().startsWith(q)) {
    return true;
  }
  if (metro.id.startsWith(q.replace(/\s+/g, "-"))) {
    return true;
  }
  return metro.aliases.some((alias) => alias.toLowerCase().startsWith(q));
}

function metroMatchesExact(metro: NewsMetro, q: string): boolean {
  if (metro.name.toLowerCase() === q) {
    return true;
  }
  return metro.aliases.some((alias) => alias.toLowerCase() === q);
}

export async function getNewsMetroById(id: string) {
  return await prisma.newsMetro.findUnique({ where: { id } });
}

export async function searchNewsMetros(input: NewsMetroSearchInput) {
  const parsed = searchSchema.parse(input);
  const q = normalizeQuery(parsed.query);
  const limit = parsed.limit ?? 25;
  const all = await loadAllNewsMetros();
  return all.filter((metro) => metroMatchesPrefix(metro, q)).slice(0, limit);
}

export async function findNewsMetroByExactNameOrAlias(text: string) {
  const q = normalizeQuery(text);
  if (!q) {
    return null;
  }
  const all = await loadAllNewsMetros();
  return all.find((metro) => metroMatchesExact(metro, q)) ?? null;
}

function haversineKm(
  lat: number,
  lng: number,
  metro: Pick<NewsMetro, "latitude" | "longitude">,
): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(metro.latitude - lat);
  const dLng = rad(metro.longitude - lng);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat)) * Math.cos(rad(metro.latitude)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export async function findNearestNewsMetro(input: NewsMetroNearestInput) {
  const parsed = nearestSchema.parse(input);
  const maxKm = parsed.maxKm ?? 150;
  const all = await loadAllNewsMetros();
  let best: NewsMetro | undefined;
  let bestKm = Infinity;
  for (const metro of all) {
    const distanceKm = haversineKm(parsed.latitude, parsed.longitude, metro);
    if (distanceKm < bestKm) {
      best = metro;
      bestKm = distanceKm;
    }
  }
  if (!best || bestKm > maxKm) {
    return null;
  }
  return { metro: best, distanceKm: bestKm };
}

export type NewsMetroSeedRow = {
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
};

export async function upsertNewsMetroSeed(row: NewsMetroSeedRow) {
  return await prisma.newsMetro.upsert({
    where: { id: row.id },
    create: row,
    update: {
      name: row.name,
      aliases: row.aliases,
      country: row.country,
      countryCode: row.countryCode,
      region: row.region,
      latitude: row.latitude,
      longitude: row.longitude,
      timezone: row.timezone,
      lang: row.lang,
    },
  });
}
