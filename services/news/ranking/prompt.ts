import type { DiscoveryPeriod } from "@/db/generated/client";

export const PRIMARY_RANKER_SYSTEM = `You are the PRIMARY ranker for financial/business news events.

Rank EVENTS (not documents). Use only the supplied evaluation, verification, and narrative context.

Rules:
- Do NOT treat article count or source count as importance.
- Do NOT reward disagreement or contradiction — treat contested evidence as requiring investigation, not as a boost.
- Separate evidence confidence from importance: a trivial but well-verified event should score lower importance than a major but partially verified one.
- Cite eventIndex values from the input; do not invent events or facts.

Output a broad candidate pool ordered by overall importance for editorial attention (up to 30).`;

export const INDEPENDENT_RANKER_SYSTEM = `You are an INDEPENDENT ranker reviewing finalist news events.

You MUST NOT use or infer any primary ranking, primary scores, or primary ordering — none is provided.

Rank only from event information, evidence summaries, evaluation dimensions, and narrative context.

Rules:
- Do NOT treat article count as importance.
- Do NOT reward disagreement automatically.
- Ground reasoning in supplied evidence only; do not invent sources.

Output an independent ordering of ALL finalist events provided.`;

export const COVERAGE_GAP_SYSTEM = `You identify coverage gaps — important stories that may be missing from the current candidate set.

Suggest search queries to find missing stories. Queries must target discoverable news (sectors, filings, market moves, regional gaps).

Do NOT invent specific events as if they already happened without evidence.
Do NOT suggest queries that assume fabricated facts.`;

export function periodRankingGuidance(period: DiscoveryPeriod): string {
  if (period === "DAY") {
    return "Period DAY: recency may legitimately increase relevance for time-sensitive developments.";
  }
  return `Period ${period}: do NOT rank primarily by latest timestamp. Weight significance, magnitude, and impact across the full period.`;
}

export function buildPrimaryRankingPrompt(input: {
  period: DiscoveryPeriod;
  region: string;
  events: Array<{
    index: number;
    title: string;
    eventType: string;
    eventDate?: string;
    narratives: string[];
    evaluation?: Record<string, unknown>;
    verification?: Record<string, unknown>;
  }>;
}): string {
  return JSON.stringify(
    {
      task: "primary_event_ranking",
      region: input.region,
      period: input.period,
      periodGuidance: periodRankingGuidance(input.period),
      events: input.events,
    },
    null,
    2,
  );
}

export function buildIndependentRankingPrompt(input: {
  period: DiscoveryPeriod;
  region: string;
  events: Array<{
    index: number;
    title: string;
    eventType: string;
    eventDate?: string;
    description?: string;
    narratives: string[];
    evaluation?: Record<string, unknown>;
    verification?: Record<string, unknown>;
  }>;
}): string {
  return JSON.stringify(
    {
      task: "independent_finalist_ranking",
      region: input.region,
      period: input.period,
      periodGuidance: periodRankingGuidance(input.period),
      events: input.events,
    },
    null,
    2,
  );
}

export function buildCoverageGapPrompt(input: {
  region: string;
  period: DiscoveryPeriod;
  candidateTitles: string[];
  entityNames: string[];
}): string {
  return JSON.stringify(
    {
      task: "coverage_gap_queries",
      region: input.region,
      period: input.period,
      currentCandidateTitles: input.candidateTitles,
      prominentEntities: input.entityNames,
    },
    null,
    2,
  );
}
