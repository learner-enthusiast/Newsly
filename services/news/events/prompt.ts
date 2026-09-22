export const EVENT_EXTRACTION_PROMPT_VERSION = "event-extraction-v1";
export const NARRATIVE_DETECTION_PROMPT_VERSION = "narrative-detection-v1";

export const EVENT_EXTRACTION_SYSTEM = `You extract real-world business/news EVENTS from factual claims.

Rules:
- An event is something that happened or is happening in the world — not the article itself.
- Multiple claims may describe the SAME event (use the same event entry with multiple claimIndexes).
- Different action states are DIFFERENT events (e.g. "considering acquisition" vs "completed acquisition").
- actionState must reflect the claim language precisely.
- Use claimIndexes referencing the numbered claims list (0-based).
- Identify contradictions between claims (confirmed vs denied, completed vs cancelled).
- Do not invent claims or facts beyond the provided text.`;

export const NARRATIVE_DETECTION_SYSTEM = `You identify ongoing NARRATIVES (themes/storylines) spanning multiple events.

Rules:
- A narrative is broader than a single event (e.g. "Indian banking stress").
- Only group events that share entities/themes and temporal continuity.
- Do not force every event into a narrative.
- Use eventIndexes from the provided numbered list (0-based).
- Pick the best EventNarrative relationship for each event in the narrative.`;

export function buildEventExtractionPrompt(input: {
  documentTitle: string;
  documentUrl: string;
  claims: Array<{ index: number; text: string; claimType: string }>;
}) {
  const claimLines = input.claims
    .map((claim) => `[${claim.index}] (${claim.claimType}) ${claim.text}`)
    .join("\n");

  return `Document: ${input.documentTitle}
URL: ${input.documentUrl}

Claims:
${claimLines}`;
}

export function buildNarrativeDetectionPrompt(input: {
  events: Array<{ index: number; title: string; eventType: string; actionState: string }>;
}) {
  const lines = input.events
    .map(
      (event) =>
        `[${event.index}] (${event.eventType}/${event.actionState}) ${event.title}`,
    )
    .join("\n");

  return `Events from this discovery run:
${lines}`;
}
