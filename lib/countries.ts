import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";

countries.registerLocale(enLocale);

export type CountryOption = {
  name: string;
  code: string;
};

/** English country names from i18n-iso-countries (ISO code kept for internal use only). */
export const COUNTRY_OPTIONS: CountryOption[] = Object.entries(
  countries.getNames("en"),
)
  .map(([code, name]) => ({ code, name }))
  .sort((left, right) => left.name.localeCompare(right.name));

const MAX_SUGGESTIONS = 10;

/** Case-insensitive filter: prefix matches first, then substring matches. */
export function filterCountryOptions(
  query: string,
  limit = MAX_SUGGESTIONS,
): CountryOption[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return [];
  }

  const prefixMatches: CountryOption[] = [];
  const containsMatches: CountryOption[] = [];

  for (const option of COUNTRY_OPTIONS) {
    const nameLower = option.name.toLowerCase();
    if (nameLower.startsWith(normalized)) {
      prefixMatches.push(option);
    } else if (nameLower.includes(normalized)) {
      containsMatches.push(option);
    }
  }

  return [...prefixMatches, ...containsMatches].slice(0, limit);
}
