import { z } from "zod";
import { serpClient } from "@/clients/serpCleint";

const searchFestivalOccurrenceSchema = z.object({
  festival: z.string().min(1),
  city: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
});

export type SearchFestivalOccurrenceParams = z.input<
  typeof searchFestivalOccurrenceSchema
>;

export async function searchFestivalOccurrence(
  params: SearchFestivalOccurrenceParams,
) {
  const { festival, city, year } = searchFestivalOccurrenceSchema.parse(params);

  return serpClient.search({
    engine: "google",
    q: `${festival} ${city} ${year} dates`,
    location: city,
    hl: "en",
    gl: "in",
    num: 10,
  });
}
