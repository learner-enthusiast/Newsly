import { extractItineraryCopy } from "./extract";
import {
  itineraryCopyInputSchema,
  type ItineraryCopyInput,
  type ItineraryCopyResult,
} from "./schema";

export { defaultModel, model } from "./model";

function fallbackDayDescription(
  day: { stops: Array<{ name: string }>; area: string | null; window: string | null },
  city: string,
) {
  if (day.stops.length === 0) {
    return `A quiet day in ${day.area ?? city}.`;
  }

  const where = day.area ? `${day.area}, ${city}` : city;
  const when = day.window ? ` between ${day.window}` : "";

  return `Cover ${day.stops.map((stop) => stop.name).join(", ")} in ${where}${when}.`;
}

/**
 * Writes day-level copy over a fixed route. Any day or stop the model skips
 * falls back to the deterministic text the route planner already produced, so
 * the itinerary never depends on the model returning a complete answer.
 */
export async function runItineraryCopyAgent(
  input: ItineraryCopyInput,
): Promise<ItineraryCopyResult> {
  const parsed = itineraryCopyInputSchema.parse(input);
  const copy = await extractItineraryCopy(parsed);
  const copyByDay = new Map(copy.days.map((day) => [day.dayNumber, day]));

  return {
    days: parsed.days.map((day) => {
      const written = copyByDay.get(day.dayNumber);
      const notesByPosition = new Map(
        (written?.stops ?? []).map((stop) => [stop.position, stop.note]),
      );

      return {
        dayNumber: day.dayNumber,
        title:
          written?.title ??
          (day.area ? `${day.area} route` : `Day ${day.dayNumber}`),
        description:
          written?.description ?? fallbackDayDescription(day, parsed.city),
        stops: day.stops.map((stop) => ({
          position: stop.position,
          note: notesByPosition.get(stop.position) ?? stop.name,
        })),
      };
    }),
  };
}
