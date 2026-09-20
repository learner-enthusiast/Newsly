import { aiClient } from "@/clients/AIClient";
import { model } from "./model";
import { ITINERARY_COPY_SYSTEM_PROMPT } from "./prompt";
import {
  itineraryCopyResultSchema,
  type ItineraryCopyInput,
} from "./schema";

export async function extractItineraryCopy(input: ItineraryCopyInput) {
  return aiClient.generate({
    model,
    system: ITINERARY_COPY_SYSTEM_PROMPT,
    prompt: `Write titles and descriptions for the already-chosen ${input.festival} days in ${input.city} ${input.year}. Do not add places.`,
    extraContext: {
      festival: input.festival,
      city: input.city,
      year: input.year,
      days: input.days,
    },
    schemaName: "ItineraryCopy",
    schemaDescription:
      "Per-day titles and descriptions for already chosen place groupings.",
    output: itineraryCopyResultSchema,
  });
}
