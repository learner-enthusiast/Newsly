import { PLANNING_RULES } from "@/services/planner/planningRules";
import { countWords } from "@/services/planner/validatePlan";
import { extractPlanDescription, type DescriptionClient } from "./extract";
import {
  planDescriptionInputSchema,
  type PlanDescriptionInput,
  type PlanDescriptionResult,
} from "./schema";

export { defaultModel, model } from "./model";

/**
 * Produces the plan-level title and description from researched festival
 * facts and the already-built itinerary.
 *
 * The festival history, terminology and city context live here rather than in
 * the itinerary agent, so day copy can never become the only (or invented)
 * source of festival background. A short first draft is retried once; if it is
 * still short the plan validator rejects the plan rather than shipping a
 * one-liner.
 */
export async function runPlanDescriptionAgent(
  input: PlanDescriptionInput,
  options: { client?: DescriptionClient } = {},
): Promise<PlanDescriptionResult> {
  const parsed = planDescriptionInputSchema.parse(input);
  const first = await extractPlanDescription(parsed, { client: options.client });

  if (countWords(first.description) >= PLANNING_RULES.description.minWords) {
    return first;
  }

  const expanded = await extractPlanDescription(parsed, {
    expand: true,
    client: options.client,
  });

  return countWords(expanded.description) > countWords(first.description)
    ? expanded
    : first;
}
