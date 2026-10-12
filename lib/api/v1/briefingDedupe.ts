/**
 * Briefing dedupe rules of the public API. `requestNews` keeps one briefing per
 * user + date + scope + location; the API answers a repeat of the same request
 * with the existing job (200) and a different request for the same slot with
 * 409, instead of silently returning a briefing built with other parameters.
 */

import type { NewsGenerationConfig } from "@/services/news/newsGenerationRequest";

const tokenSet = (values: string[]) =>
  [...new Set(values.map((v) => v.trim().toLowerCase()))].sort().join("\n");

/**
 * True when a normalized request asks for exactly what the stored briefing was
 * built with. Coordinates count only when the client sent them (the web app
 * may have filled them in from the location).
 */
export function sameBriefingParams(
  requested: NewsGenerationConfig,
  stored: NewsGenerationConfig,
  clientSentCoordinates: boolean,
): boolean {
  if (requested.storyCount !== stored.storyCount) return false;
  if (tokenSet(requested.categories) !== tokenSet(stored.categories)) return false;
  if ((requested.customQuery ?? "") !== (stored.customQuery ?? "")) return false;
  if (requested.language.toLowerCase() !== stored.language.toLowerCase()) return false;
  if (tokenSet(requested.sources) !== tokenSet(stored.sources)) return false;
  if (clientSentCoordinates) {
    if (requested.latitude !== stored.latitude || requested.longitude !== stored.longitude) return false;
    if (requested.locationRadiusMeters !== stored.locationRadiusMeters) return false;
  }
  return true;
}
