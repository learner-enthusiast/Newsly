import { aiClient } from "@/clients/AIClient";
import { FESTIVAL_FACTS_SYSTEM_PROMPT } from "./prompt";
import {
  festivalFactsSchema,
  type FestivalFactsInput,
} from "./schema";

export async function extractFestivalFacts(input: FestivalFactsInput) {
  return aiClient.generate({
    system: FESTIVAL_FACTS_SYSTEM_PROMPT,
    prompt: `Extract festival facts for ${input.festival} in ${input.city} in ${input.year}. Unknown fields must be null. Do not invent dates.`,
    extraContext: {
      festival: input.festival,
      city: input.city,
      year: input.year,
      sources: input.sources,
    },
    schemaName: "FestivalFacts",
    schemaDescription:
      "Verified festival name, dates, important days, legacy, timings, and sources.",
    output: festivalFactsSchema,
  });
}
