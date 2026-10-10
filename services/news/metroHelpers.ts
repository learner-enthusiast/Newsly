export function formatNewsMetroLabel(metro: {
  name: string;
  country: string;
}): string {
  return `${metro.name}, ${metro.country}`;
}

/** SerpApi Google News params for a metro's local news. */
export function localNewsParamsForMetro(
  metro: {
    name: string;
    aliases: string[];
    countryCode: string;
    lang: string;
  },
  englishOnly = true,
) {
  const names = [metro.name, ...metro.aliases.filter((alias) => alias.length > 3)].map(
    (name) => `"${name}"`,
  );
  return {
    engine: "google_news" as const,
    q: names.join(" OR "),
    gl: metro.countryCode,
    hl: englishOnly ? "en" : metro.lang,
  };
}
