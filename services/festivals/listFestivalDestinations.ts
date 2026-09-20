import {
  getFestivalNamesAndCities,
  type FestivalNameAndCities,
} from "@/repositories/festivalKnowledge";

export type FestivalDestinationOption = {
  festivalName: string;
  festivalSlug: string;
  cityName: string;
  state: string | null;
  label: string;
  message: string;
};

function toDestinationOptions(
  festival: FestivalNameAndCities,
): FestivalDestinationOption[] {
  return festival.cities.map((city) => ({
    festivalName: festival.name,
    festivalSlug: festival.slug,
    cityName: city.name,
    state: city.state,
    label: `${festival.name} in ${city.name}`,
    message: `Plan ${festival.name} in ${city.name}`,
  }));
}

export async function listFestivalDestinationOptions(): Promise<
  FestivalDestinationOption[]
> {
  const festivals = await getFestivalNamesAndCities();

  return festivals
    .flatMap(toDestinationOptions)
    .sort((a, b) => a.label.localeCompare(b.label));
}
