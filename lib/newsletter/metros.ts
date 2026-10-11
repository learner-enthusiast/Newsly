import { NEWS_METRO_SEEDS } from "@/config/newsMetros";

const METRO_BY_NAME = new Map<string, string>();
const METRO_BY_ALIAS = new Map<string, string>();

for (const metro of NEWS_METRO_SEEDS) {
  METRO_BY_NAME.set(metro.name.trim().toLowerCase(), metro.id);
  for (const alias of metro.aliases) {
    METRO_BY_ALIAS.set(alias.trim().toLowerCase(), metro.id);
  }
  METRO_BY_ALIAS.set(metro.id, metro.id);
}

/** Map free-text location to a stable metro id when possible. */
export function normalizeLocationToMetroId(location: string | null | undefined): string | null {
  if (!location?.trim()) {
    return null;
  }
  const primary = location.split(",")[0]?.trim().toLowerCase() ?? "";
  if (!primary) {
    return null;
  }
  return (
    METRO_BY_NAME.get(primary) ??
    METRO_BY_ALIAS.get(primary) ??
    null
  );
}

export function listKnownMetroIds(): string[] {
  return NEWS_METRO_SEEDS.map((row) => row.id);
}
