/**
 * Derives a human area label ("Haltu", "Manicktala") from a postal address.
 *
 * Areas are read off the researched addresses — the planner never carries a
 * hardcoded list or ranking of localities for any city.
 */
const ROAD_WORDS =
  /\b(rd|road|st|street|lane|ln|sarani|marg|path|avenue|ave|bypass|highway|crossing|gali|chowk|circle|block)\b/i;
const STATE_WORDS =
  /\b(west bengal|maharashtra|delhi|karnataka|tamil nadu|kerala|gujarat|rajasthan|odisha|assam|bihar|telangana|andhra pradesh|punjab|haryana|uttar pradesh|madhya pradesh|india)\b/i;
const PIN_CODE = /\b\d{5,6}\b/;
const PLUS_CODE = /^[A-Z0-9]{4}\+[A-Z0-9]{2,3}$/i;

function cleanSegment(segment: string) {
  return segment.trim().replace(/\s+/g, " ");
}

function isNoise(segment: string, city: string | null | undefined) {
  if (segment.length < 3) {
    return true;
  }

  if (PLUS_CODE.test(segment) || /^\d+[a-z]?$/i.test(segment)) {
    return true;
  }

  if (STATE_WORDS.test(segment)) {
    return true;
  }

  if (city && segment.toLowerCase() === city.trim().toLowerCase()) {
    return true;
  }

  return false;
}

function titleCase(value: string) {
  return value
    .split(" ")
    .map((word) =>
      word.length <= 2
        ? word.toUpperCase()
        : `${word[0].toUpperCase()}${word.slice(1).toLowerCase()}`,
    )
    .join(" ");
}

/**
 * Picks the locality-looking segment closest to the city, skipping street
 * names, plus codes, pin codes and the state. Returns null when the address
 * carries no usable locality.
 */
export function deriveAreaLabel(
  address: string | null | undefined,
  city?: string | null,
): string | null {
  if (!address?.trim()) {
    return null;
  }

  const segments = address
    .split(",")
    .map(cleanSegment)
    .map((segment) => segment.replace(PIN_CODE, "").trim())
    .filter((segment) => segment.length > 0)
    .filter((segment) => !isNoise(segment, city));

  if (segments.length === 0) {
    return null;
  }

  const localities = segments.filter((segment) => !ROAD_WORDS.test(segment));
  const candidate = (localities.length > 0 ? localities : segments).at(-1);

  return candidate ? titleCase(candidate) : null;
}
