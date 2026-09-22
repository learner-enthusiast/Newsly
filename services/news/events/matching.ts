import type { Event, Region } from "@/db/generated/client";
import {
  normalizeEventTitle,
  titleJaccardSimilarity,
} from "@/domain/news/normalize-event-title";
import type { ExtractedEventCandidate } from "@/services/news/events/schemas";

const TITLE_MERGE_THRESHOLD = 0.55;

export function readEventActionState(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const value = (metadata as Record<string, unknown>).actionState;
  return typeof value === "string" ? value : undefined;
}

export function scoreEventCandidateMatch(
  candidate: ExtractedEventCandidate,
  existing: Event,
): number {
  const normalizedCandidate = normalizeEventTitle(candidate.title);
  let score = 0;

  if (existing.normalizedTitle === normalizedCandidate) {
    score += 0.45;
  }

  score += titleJaccardSimilarity(candidate.title, existing.title) * 0.35;

  if (existing.eventType === candidate.eventType) {
    score += 0.1;
  }

  const existingAction = readEventActionState(existing.metadata);
  if (existingAction && existingAction === candidate.actionState) {
    score += 0.2;
  } else if (existingAction && existingAction !== candidate.actionState) {
    score -= 0.35;
  }

  return score;
}

export function pickBestEventMatch(
  candidate: ExtractedEventCandidate,
  candidates: Event[],
): { event: Event; score: number } | null {
  let best: { event: Event; score: number } | null = null;

  for (const event of candidates) {
    const score = scoreEventCandidateMatch(candidate, event);
    if (!best || score > best.score) {
      best = { event, score };
    }
  }

  if (!best || best.score < TITLE_MERGE_THRESHOLD) {
    return null;
  }

  return best;
}

export function buildEventMetadata(
  candidate: ExtractedEventCandidate,
  discoveryRunId: string,
) {
  return {
    actionState: candidate.actionState,
    primaryAction: candidate.primaryAction,
    keyNumbers: candidate.keyNumbers,
    discoveryRunId,
    promptVersion: "event-extraction-v1",
  };
}

export function resolveEventRegion(
  requestRegion: "INDIA" | "WORLD" | "BOTH",
  sourceRegion?: Region | null,
): Region {
  if (requestRegion === "INDIA") {
    return "INDIA";
  }
  if (requestRegion === "WORLD") {
    return "WORLD";
  }
  return sourceRegion ?? "INDIA";
}
