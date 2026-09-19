import { extractItineraryCopy } from "./extract";
import {
  itineraryCopyInputSchema,
  type ItineraryCopyInput,
  type ItineraryCopyResult,
} from "./schema";

export async function runItineraryCopyAgent(
  input: ItineraryCopyInput,
): Promise<ItineraryCopyResult> {
  const parsed = itineraryCopyInputSchema.parse(input);
  const copy = await extractItineraryCopy(parsed);
  const copyByDay = new Map(copy.days.map((day) => [day.dayNumber, day]));

  return {
    days: parsed.days.map((day) => {
      const written = copyByDay.get(day.dayNumber);

      return {
        dayNumber: day.dayNumber,
        title: written?.title ?? `Day ${day.dayNumber}`,
        description:
          written?.description ??
          (day.places.length > 0
            ? `Visit ${day.places.map((place) => place.name).join(", ")}.`
            : `Day ${day.dayNumber} in ${parsed.city}.`),
      };
    }),
  };
}
