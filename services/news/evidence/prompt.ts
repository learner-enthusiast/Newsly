export const EVENT_EVIDENCE_PROMPT_VERSION = "event-evidence-v1";

export const EVENT_VERIFICATION_SYSTEM = `You assess EVIDENCE ONLY for a news event.

Rules:
- Do NOT score event importance, market impact, or editorial interest.
- Do NOT invent facts, sources, or documents. Use ONLY the evidence graph provided.
- Consensus is not truth. If sources disagree, set preserveDisagreement true and use CONTESTED or MIXED consensus.
- A media article quoting an official source is NOT a primary source unless the document itself is from an official publisher in the graph.
- Cite claims and documents by index from the prompt when reasoning.

Output structured fields only.`;

export const EVENT_EVALUATION_SYSTEM = `You evaluate EVENT IMPORTANCE and editorial potential.

Rules:
- This is separate from evidence confidence. A huge rumor can score high magnitude but you must not treat it as verified.
- Do NOT invent facts. Ground whatChanged and whyItMatters in the evidence graph.
- evidenceConfidence is NOT in this schema — do not substitute importance for proof.
- previousState should describe the understood situation before this event based on cited claims only.
- Cite claims by index when making factual assertions.`;

export function buildEventVerificationPrompt(input: {
  eventTitle: string;
  eventType: string;
  eventDescription?: string | null;
  computed: {
    primarySourceAvailable: boolean;
    independentSourceCount: number;
    supportingSourceCount: number;
    contradictingSourceCount: number;
    independenceGroups: Array<{
      representativeDomain: string;
      documentIndexes: number[];
      kind: string;
    }>;
  };
  claims: Array<{
    index: number;
    id: string;
    text: string;
    relationship: string;
    documentIndex: number;
  }>;
  documents: Array<{
    index: number;
    id: string;
    title: string;
    url: string;
    domain: string;
    sourceType: string;
    isOfficialPrimary: boolean;
    documentRelationship: string;
    contentHashPrefix: string;
  }>;
  entities: string[];
  narratives: string[];
  contradictions: Array<{
    claimIndexA: number;
    claimIndexB: number;
    severity: string;
    explanation?: string | null;
  }>;
}): string {
  return JSON.stringify(
    {
      task: "event_verification",
      event: {
        title: input.eventTitle,
        eventType: input.eventType,
        description: input.eventDescription ?? undefined,
      },
      computedSourceMetrics: input.computed,
      entities: input.entities,
      narratives: input.narratives,
      documents: input.documents,
      claims: input.claims,
      contradictions: input.contradictions,
    },
    null,
    2,
  );
}

export function buildEventEvaluationPrompt(input: {
  eventTitle: string;
  eventType: string;
  eventDescription?: string | null;
  verificationSummary: {
    evidenceConfidence: number;
    verificationStatus: string;
    consensusLevel: string;
    primarySourceAvailable: boolean;
    independentSourceCount: number;
  };
  claims: Array<{
    index: number;
    text: string;
    relationship: string;
  }>;
  entities: string[];
  narratives: string[];
}): string {
  return JSON.stringify(
    {
      task: "event_evaluation",
      event: {
        title: input.eventTitle,
        eventType: input.eventType,
        description: input.eventDescription ?? undefined,
      },
      verificationSummary: input.verificationSummary,
      entities: input.entities,
      narratives: input.narratives,
      claims: input.claims,
    },
    null,
    2,
  );
}
