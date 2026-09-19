import { dropIncompleteCoordinates } from "@/services/planner/normalize/place";
import { extractResearchedPlaces } from "./extract";
import {
  placeResearchInputSchema,
  type PlaceResearchInput,
  type PlaceResearchResult,
} from "./schema";

export async function runPlaceResearchAgent(
  input: PlaceResearchInput,
): Promise<PlaceResearchResult> {
  const parsed = placeResearchInputSchema.parse(input);
  const result = await extractResearchedPlaces(parsed);

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
