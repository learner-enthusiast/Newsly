import { createHash } from "node:crypto";
import type { NewsScope } from "@/db/generated/client";
import {
  normalizeSourceDomains,
  resolveSerpHl,
} from "@/services/news/newsGenerationRequest";
import { normalizeLocationToMetroId } from "@/lib/newsletter/metros";
import { newsWindow } from "@/lib/newsletter/schedule";
import type { NewsletterFrequency } from "@/db/generated/client";

export type NewsletterContentParams = {
  location: string | null;
  latitude: number | null;
  longitude: number | null;
  scope: NewsScope;
  storyCount: number;
  categories: string[];
  customQuery: string | null;
  language: string | null;
  sources: string[];
};

export type NormalizedNewsletterParams = {
  metroId: string | null;
  locationLabel: string | null;
  latitude: number | null;
  longitude: number | null;
  scope: NewsScope;
  categories: string[];
  customQuery: string | null;
  serpHl: string;
  sources: string[];
};

export function normalizeParams(
  params: Omit<NewsletterContentParams, "storyCount">,
): NormalizedNewsletterParams {
  const locationLabel = params.location?.trim() || null;
  const metroId = normalizeLocationToMetroId(locationLabel);
  const categories = [...params.categories]
    .map((value) => value.trim())
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
  const sources = normalizeSourceDomains(params.sources).sort();
  const customQuery = params.customQuery?.trim() || null;

  return {
    metroId,
    locationLabel,
    latitude: params.latitude ?? null,
    longitude: params.longitude ?? null,
    scope: params.scope,
    categories,
    customQuery,
    serpHl: resolveSerpHl(params.language),
    sources,
  };
}

export function fingerprint(normalized: NormalizedNewsletterParams): string {
  const payload = JSON.stringify(normalized);
  return createHash("sha256").update(payload).digest("hex");
}

export function periodKeyForEdition(
  scheduledFor: Date,
  timezone: string,
  frequency: NewsletterFrequency,
): string {
  return newsWindow(scheduledFor, timezone, frequency).periodKey;
}
