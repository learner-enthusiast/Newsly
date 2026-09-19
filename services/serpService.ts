import { serpClient } from "@/clients/serpCleint";

const DEFAULT_SEARCH_OPTIONS = {
  hl: "en",
  gl: "in",
  device: "desktop" as const,
};

export type FestivalQuery = {
  festival: string;
  city: string;
  year: number;
};

export type PlaceDiscoveryQuery = {
  query: string;
  city: string;
  area?: string;
  limit?: number;
};

export type PlaceDetailsQuery = {
  placeId: string;
};

export type WeatherQuery = {
  city: string;
  date?: string;
};

export type PlaceCategory =
  | "pandal"
  | "food"
  | "restaurant"
  | "parking"
  | "cafe"
  | "restroom"
  | "atm"
  | "pharmacy";

export type DiscoverPlacesQuery = {
  city: string;
  area?: string;
  category: PlaceCategory;
  limit?: number;
};

export type NormalizedPlace = {
  externalId: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  reviewCount?: number;
  description?: string;
  type?: string;
  thumbnail?: string;
  source: "serpapi_google_maps";
};

type SerpServiceMethod<Fn extends (...args: never[]) => unknown> = {
  description: string;
  fn: Fn;
};

const PLACE_QUERIES: Record<PlaceCategory, string> = {
  pandal: "Durga Puja pandal",
  food: "street food food stalls",
  restaurant: "restaurants",
  parking: "parking",
  cafe: "cafes",
  restroom: "public toilets",
  atm: "ATM",
  pharmacy: "pharmacy",
};

function locationText(city: string, area?: string) {
  return area ? `${area}, ${city}` : city;
}

async function searchFestivalFacts({ festival, city, year }: FestivalQuery) {
  return serpClient.search({
    engine: "google",
    q: `${festival} ${city} ${year} dates timings history`,
    location: city,
    ...DEFAULT_SEARCH_OPTIONS,
    num: 10,
  });
}

async function searchFestivalDates({ festival, city, year }: FestivalQuery) {
  return serpClient.search({
    engine: "google",
    q: `${festival} ${city} ${year} dates start end`,
    location: city,
    ...DEFAULT_SEARCH_OPTIONS,
    num: 10,
  });
}

async function searchFestivalHistory({ festival, city }: FestivalQuery) {
  return serpClient.search({
    engine: "google",
    q: `${festival} ${city} history tradition legacy`,
    location: city,
    ...DEFAULT_SEARCH_OPTIONS,
    num: 10,
  });
}

async function searchFestivalEvents({ festival, city, year }: FestivalQuery) {
  return serpClient.search({
    engine: "google",
    q: `${festival} ${city} events ${year}`,
    location: city,
    ...DEFAULT_SEARCH_OPTIONS,
    num: 10,
  });
}

async function discoverPujaPlaces({
  city,
  area,
  limit = 20,
}: Omit<DiscoverPlacesQuery, "category">) {
  return serpClient.search({
    engine: "google_maps",
    type: "search",
    q: `Durga Puja pandal ${locationText(city, area)}`,
    ...DEFAULT_SEARCH_OPTIONS,
    num: Math.min(limit, 20),
  });
}

async function discoverFoodPlaces({
  city,
  area,
  limit = 20,
}: Omit<DiscoverPlacesQuery, "category">) {
  return serpClient.search({
    engine: "google_maps",
    type: "search",
    q: `food stalls street food restaurants ${locationText(city, area)}`,
    ...DEFAULT_SEARCH_OPTIONS,
    num: Math.min(limit, 20),
  });
}

async function discoverNearbyPlaces({
  query,
  city,
  area,
  limit = 20,
}: PlaceDiscoveryQuery) {
  return serpClient.search({
    engine: "google_maps",
    type: "search",
    q: `${query} ${locationText(city, area)}`,
    ...DEFAULT_SEARCH_OPTIONS,
    num: Math.min(limit, 20),
  });
}

async function getPlaceDetails({ placeId }: PlaceDetailsQuery) {
  return serpClient.search({
    engine: "google_maps",
    type: "place",
    place_id: placeId,
    ...DEFAULT_SEARCH_OPTIONS,
  });
}

async function searchWeather({ city, date }: WeatherQuery) {
  return serpClient.search({
    engine: "google",
    q: date ? `weather ${city} ${date}` : `weather ${city}`,
    location: city,
    ...DEFAULT_SEARCH_OPTIONS,
    num: 5,
  });
}

async function discoverPlaces({
  city,
  area,
  category,
  limit = 20,
}: DiscoverPlacesQuery) {
  return serpClient.search({
    engine: "google_maps",
    type: "search",
    q: `${PLACE_QUERIES[category]} ${locationText(city, area)}`,
    ...DEFAULT_SEARCH_OPTIONS,
    num: Math.min(limit, 20),
  });
}

function normalizeMapsPlace(place: {
  place_id?: string;
  data_id?: string;
  title: string;
  address?: string;
  gps_coordinates?: { latitude?: number; longitude?: number };
  rating?: number;
  reviews?: number;
  description?: string;
  type?: string;
  thumbnail?: string;
}): NormalizedPlace {
  return {
    externalId: place.place_id ?? place.data_id ?? "",
    name: place.title,
    address: place.address,
    latitude: place.gps_coordinates?.latitude,
    longitude: place.gps_coordinates?.longitude,
    rating: place.rating,
    reviewCount: place.reviews,
    description: place.description,
    type: place.type,
    thumbnail: place.thumbnail,
    source: "serpapi_google_maps",
  };
}

export const serpService = {
  searchFestivalFacts: {
    description:
      "Search Google for festival dates, timings, and history in a city and year.",
    fn: searchFestivalFacts,
  },
  searchFestivalDates: {
    description: "Search Google for a festival's start and end dates.",
    fn: searchFestivalDates,
  },
  searchFestivalHistory: {
    description: "Search Google for a festival's history, tradition, and legacy.",
    fn: searchFestivalHistory,
  },
  searchFestivalEvents: {
    description: "Search Google for festival events in a city and year.",
    fn: searchFestivalEvents,
  },
  discoverPujaPlaces: {
    description: "Find Durga Puja pandals on Google Maps for a city or area.",
    fn: discoverPujaPlaces,
  },
  discoverFoodPlaces: {
    description:
      "Find food stalls, street food, and restaurants on Google Maps.",
    fn: discoverFoodPlaces,
  },
  discoverNearbyPlaces: {
    description: "Find nearby places on Google Maps for a custom query.",
    fn: discoverNearbyPlaces,
  },
  discoverPlaces: {
    description:
      "Find places on Google Maps by category such as pandal, food, or parking.",
    fn: discoverPlaces,
  },
  getPlaceDetails: {
    description: "Fetch Google Maps details for a single place id.",
    fn: getPlaceDetails,
  },
  searchWeather: {
    description:
      "MVP Google weather lookup for a city. Not for long-range festival forecasts.",
    fn: searchWeather,
  },
  normalizeMapsPlace: {
    description: "Normalize a Google Maps SerpAPI place into a shared shape.",
    fn: normalizeMapsPlace,
  },
} as const satisfies Record<string, SerpServiceMethod<(...args: never[]) => unknown>>;
