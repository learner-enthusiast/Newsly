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
    prompt: `Write the day titles, day descriptions, and per-stop notes for the already-planned ${input.festival} days in ${input.city} ${input.year}. Explain the route and the timing. Do not add places.`,
    extraContext: {
      festival: input.festival,
      city: input.city,
      year: input.year,
      days: input.days,
    },
    schemaName: "ItineraryCopy",
    schemaDescription:
      "Per-day titles, descriptions, and per-stop notes for an already-built route.",
    output: itineraryCopyResultSchema,
  });
}
