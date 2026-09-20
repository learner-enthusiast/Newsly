import { aiClient } from "@/clients/AIClient";
import { model } from "./model";
import { FOOD_RESEARCH_SYSTEM_PROMPT } from "./prompt";
import { foodResearchResultSchema, type FoodResearchInput } from "./schema";

export async function extractResearchedFoodPlaces(input: FoodResearchInput) {
  const location = input.area ? `${input.area}, ${input.city}` : input.city;

  return aiClient.generate({
    model,
    system: FOOD_RESEARCH_SYSTEM_PROMPT,
    prompt: `Extract verified food stalls, restaurants, and cafes in ${location}${input.festival ? ` for ${input.festival}` : ""}. Classify type as food, restaurant, or cafe only from evidence. Do not invent coordinates, ratings, or IDs.`,
    extraContext: {
      city: input.city,
      area: input.area ?? null,
      festival: input.festival ?? null,
      sources: input.sources,
    },
    schemaName: "FoodResearch",
    schemaDescription:
      "Food, restaurant, and cafe places copied from research evidence.",
    output: foodResearchResultSchema,
  });
}
