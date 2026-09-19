import { aiClient } from "@/clients/AIClient";
import { plannerIntakeModel } from "./model";
import {
  INTAKE_SYSTEM_PROMPT,
  OCCURRENCE_SYSTEM_PROMPT,
  VISIT_DATE_SYSTEM_PROMPT,
} from "./prompt";
import {
  extractedIntakeSchema,
  festivalOccurrenceExtractionSchema,
  visitDateResolutionSchema,
  type ExtractedIntake,
  type PlanningRequest,
} from "./schema";

export async function extractPlanningRequest(params: {
  message: string;
  previousRequest?: PlanningRequest | null;
}): Promise<ExtractedIntake> {
  return aiClient.generate({
    model: plannerIntakeModel(),
    system: INTAKE_SYSTEM_PROMPT,
    prompt: params.message,
    extraContext: {
      previousRequest: params.previousRequest ?? null,
    },
    schemaName: "PlannerIntakeExtraction",
    schemaDescription:
      "Extracted festival planning requirements from the user message.",
    output: extractedIntakeSchema,
  });
}

export async function extractFestivalOccurrence(params: {
  festival: string;
  city: string;
  year: number;
  evidence: unknown;
}) {
  return aiClient.generate({
    model: plannerIntakeModel(),
    system: OCCURRENCE_SYSTEM_PROMPT,
    prompt: `Extract the official occurrence dates for ${params.festival} in ${params.city} in ${params.year}.`,
    extraContext: {
      festival: params.festival,
      city: params.city,
      year: params.year,
      searchEvidence: params.evidence,
    },
    schemaName: "FestivalOccurrence",
    schemaDescription: "Verified festival start and end dates from search evidence.",
    output: festivalOccurrenceExtractionSchema,
  });
}

export async function resolveVisitDates(params: {
  year: number;
  visitDateMentions: string[] | null;
}) {
  if (!params.visitDateMentions?.length) {
    return [] as string[];
  }

  const resolved = await aiClient.generate({
    model: plannerIntakeModel(),
    system: VISIT_DATE_SYSTEM_PROMPT,
    prompt: `Convert these visit date mentions to ISO dates for year ${params.year}.`,
    extraContext: {
      year: params.year,
      visitDateMentions: params.visitDateMentions,
    },
    schemaName: "VisitDates",
    schemaDescription: "User visit dates as ISO YYYY-MM-DD values.",
    output: visitDateResolutionSchema,
  });

  return resolved.visitDates ?? [];
}

export function compactSearchEvidence(searchResult: unknown) {
  if (!searchResult || typeof searchResult !== "object") {
    return {
      answerBox: null,
      knowledgeGraph: null,
      organicResults: [],
    };
  }

  const result = searchResult as {
    organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
    answer_box?: Record<string, unknown>;
    knowledge_graph?: Record<string, unknown>;
  };

  return {
    answerBox: result.answer_box ?? null,
    knowledgeGraph: result.knowledge_graph ?? null,
    organicResults: (result.organic_results ?? []).slice(0, 8).map((item) => ({
      title: item.title ?? null,
      snippet: item.snippet ?? null,
      link: item.link ?? null,
    })),
  };
}
