import { z } from "zod";
import { serpService } from "@/services/serpService";
import { mapSerpWeather } from "@/services/planner/weather";

const festivalQuerySchema = z.object({
  festival: z.string().min(1),
  city: z.string().min(1),
  year: z.number().int().min(1900).max(2200),
});

const placeDiscoverySchema = z.object({
  city: z.string().min(1),
  area: z.string().min(1).optional(),
  limit: z.number().int().positive().max(20).optional(),
});

const weatherQuerySchema = z.object({
  city: z.string().min(1),
  date: z.string().min(1).optional(),
});

export async function searchFestivalFacts(
  params: z.input<typeof festivalQuerySchema>,
) {
  return serpService.searchFestivalFacts.fn(festivalQuerySchema.parse(params));
}

export async function searchFestivalDates(
  params: z.input<typeof festivalQuerySchema>,
) {
  return serpService.searchFestivalDates.fn(festivalQuerySchema.parse(params));
}

export async function discoverPujaPlaces(
  params: z.input<typeof placeDiscoverySchema>,
) {
  return serpService.discoverPujaPlaces.fn(placeDiscoverySchema.parse(params));
}

export async function discoverFoodPlaces(
  params: z.input<typeof placeDiscoverySchema>,
) {
  return serpService.discoverFoodPlaces.fn(placeDiscoverySchema.parse(params));
}

export async function searchWeather(params: z.input<typeof weatherQuerySchema>) {
  return serpService.searchWeather.fn(weatherQuerySchema.parse(params));
}

export async function getWeatherSnapshot(params: z.input<typeof weatherQuerySchema>) {
  const parsed = weatherQuerySchema.parse(params);
  const result = await searchWeather(parsed);

  return mapSerpWeather(result, {
    location: parsed.city,
    date: parsed.date,
  });
}

export function compactOrganicResults(searchResult: unknown) {
  if (!searchResult || typeof searchResult !== "object") {
    return {
      answerBox: null,
      knowledgeGraph: null,
      organicResults: [],
    };
  }

  const result = searchResult as {
    organic_results?: Array<{ title?: string; snippet?: string; link?: string }>;
    answer_box?: Record<string, unknown>;
    knowledge_graph?: Record<string, unknown>;
  };

  return {
    answerBox: result.answer_box ?? null,
    knowledgeGraph: result.knowledge_graph ?? null,
    organicResults: (result.organic_results ?? []).slice(0, 8).map((item) => ({
      title: item.title ?? null,
      snippet: item.snippet ?? null,
      link: item.link ?? null,
    })),
  };
}

export function mapsPlacesFromSearch(searchResult: unknown) {
  if (!searchResult || typeof searchResult !== "object") {
    return [];
  }

  const result = searchResult as {
    local_results?: unknown[];
    place_results?: unknown;
  };

  if (Array.isArray(result.local_results)) {
    return result.local_results;
  }

  if (result.place_results) {
    return [result.place_results];
  }

  return [];
}
