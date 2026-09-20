import { dropIncompleteCoordinates } from "@/services/planner/normalize/place";
import { extractResearchedFoodPlaces } from "./extract";
import {
  foodResearchInputSchema,
  type FoodResearchInput,
  type FoodResearchResult,
} from "./schema";

export { defaultModel, model } from "./model";

export async function runFoodResearchAgent(
  input: FoodResearchInput,
): Promise<FoodResearchResult> {
  const parsed = foodResearchInputSchema.parse(input);
  const result = await extractResearchedFoodPlaces(parsed);

  return {
    places: result.places.map((place) =>
      dropIncompleteCoordinates({
        ...place,
        city: place.city ?? parsed.city,
        area: place.area ?? parsed.area ?? null,
      }),
    ),
  };
}
