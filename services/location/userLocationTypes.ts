export type LocationGeoAnchor = {
  latitude: number;
  longitude: number;
};

/** Serp Google Maps Autocomplete suggestion (subset of fields we use). */
export type LocationAutocompleteSuggestion = {
  value: string;
  subtext?: string;
  type?: string;
  latitude?: number;
  longitude?: number;
  data_id?: string;
  serpapi_link?: string;
  maps_serpapi_link?: string;
  reviews_serpapi_link?: string;
  photos_serpapi_link?: string;
};

export type ResolvedUserLocation = {
  latitude: number;
  longitude: number;
  label: string;
  metroCity: string | null;
  state: string | null;
  country: string | null;
  suggestion: LocationAutocompleteSuggestion | null;
};
