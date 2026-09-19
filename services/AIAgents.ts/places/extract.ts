import { aiClient } from "@/clients/AIClient";
import { PLACE_RESEARCH_SYSTEM_PROMPT } from "./prompt";
import {
  placeResearchResultSchema,
  type PlaceResearchInput,
} from "./schema";

export async function extractResearchedPlaces(input: PlaceResearchInput) {
  const location = input.area ? `${input.area}, ${input.city}` : input.city;

  return aiClient.generate({
    system: PLACE_RESEARCH_SYSTEM_PROMPT,
    prompt: `Extract verified places/pandals in ${location}${input.festival ? ` for ${input.festival}` : ""}. Do not invent coordinates, ratings, or IDs.`,
    extraContext: {
      city: input.city,
      area: input.area ?? null,
      festival: input.festival ?? null,
      sources: input.sources,
    },
    schemaName: "PlaceResearch",
    schemaDescription:
      "Places copied from research evidence with unknown fields set to null.",
    output: placeResearchResultSchema,
  });
}
