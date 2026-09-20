import { aiClient } from "@/clients/AIClient";
import { model } from "./model";
import {
  PLAN_DESCRIPTION_EXPAND_SUFFIX,
  PLAN_DESCRIPTION_SYSTEM_PROMPT,
} from "./prompt";
import {
  planDescriptionResultSchema,
  type PlanDescriptionInput,
} from "./schema";

/** Injectable for tests so the LLM can be mocked without network calls. */
export type DescriptionClient = Pick<typeof aiClient, "generate">;

export async function extractPlanDescription(
  input: PlanDescriptionInput,
  options: { expand?: boolean; client?: DescriptionClient } = {},
) {
  const prompt = [
    `Write the plan title and description for a ${input.visitDates.length || input.days.length}-day ${input.festival} trip in ${input.city}, ${input.year}.`,
    "Use only the festival facts, sources, and itinerary given below.",
    options.expand ? PLAN_DESCRIPTION_EXPAND_SUFFIX : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (options.client ?? aiClient).generate({
    model,
    system: PLAN_DESCRIPTION_SYSTEM_PROMPT,
    prompt,
    extraContext: input,
    schemaName: "PlanDescription",
    schemaDescription:
      "Plan title, 150-300 word festival-aware description, and the festival terminology used.",
    output: planDescriptionResultSchema,
  });
}
