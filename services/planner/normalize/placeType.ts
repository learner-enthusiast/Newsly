import { z } from "zod";

/**
 * Domain place/item taxonomy and the semantic normalization that maps a
 * provider category (Google Maps `type`) plus research evidence onto it.
 *
 * Google classifies a Durga Puja pandal as "temple", "event venue", "club" or
 * "community center". The provider category alone must never decide the
 * application type: researched festival context wins.
 */
export const placeTypeSchema = z.enum([
  "pandal",
  "temple",
  "food",
  "restaurant",
  "cafe",
  "parking",
  "restroom",
  "atm",
  "pharmacy",
  "event",
  "other",
]);

export const foodPlaceTypeSchema = z.enum(["food", "restaurant", "cafe"]);

export type PlaceType = z.output<typeof placeTypeSchema>;
export type FoodPlaceType = z.output<typeof foodPlaceTypeSchema>;

export type PlanItemType =
  | "pandal"
  | "food"
  | "restaurant"
  | "cafe"
  | "parking"
  | "restroom"
  | "event"
  | "custom";

/** Where the candidate came from, which is itself evidence about what it is. */
export type DiscoveryIntent = "festival" | "food" | "unknown";

const RAW_TYPE_HINTS: Array<{ match: string; type: PlaceType }> = [
  { match: "pandal", type: "pandal" },
  { match: "temple", type: "temple" },
  { match: "place of worship", type: "temple" },
  { match: "hindu", type: "temple" },
  { match: "shrine", type: "temple" },
  { match: "cafe", type: "cafe" },
  { match: "coffee", type: "cafe" },
  { match: "tea house", type: "cafe" },
  // Street-food categories come before "restaurant": Google labels stalls
  // "Street food restaurant", which is a food stop, not sit-down dining.
  { match: "street food", type: "food" },
  { match: "food stall", type: "food" },
  { match: "food court", type: "food" },
  { match: "food street", type: "food" },
  { match: "restaurant", type: "restaurant" },
  { match: "dhaba", type: "restaurant" },
  { match: "eatery", type: "restaurant" },
  { match: "food", type: "food" },
  { match: "snack", type: "food" },
  { match: "sweet", type: "food" },
  { match: "stall", type: "food" },
  { match: "parking", type: "parking" },
  { match: "toilet", type: "restroom" },
  { match: "restroom", type: "restroom" },
  { match: "atm", type: "atm" },
  { match: "pharmacy", type: "pharmacy" },
  { match: "chemist", type: "pharmacy" },
  { match: "event", type: "event" },
  { match: "festival", type: "event" },
];

/**
 * Venue words that mark a festival installation in Indian festival usage.
 * These are venue nouns, not festival names — festival-specific terms come
 * from `festivalTokens` so the rule stays festival-agnostic.
 */
const FESTIVAL_VENUE_WORDS = [
  "pandal",
  "pandel",
  "mandap",
  "mandapam",
  "mandal",
  "sarbojanin",
  "sarbojanan",
  "sarbojonin",
  "barowari",
  "barwari",
  "puja committee",
  "pujo committee",
  "utsab committee",
  "utsav samiti",
  "puja samiti",
  "durgotsav",
  "durgotsab",
  "ganeshotsav",
  "utsav",
  "utsab",
  "pujo",
];

/** Festival-name words that carry no discriminating signal on their own. */
const FESTIVAL_TOKEN_STOPWORDS = new Set([
  "the",
  "and",
  "of",
  "in",
  "at",
  "festival",
  "fest",
  "celebration",
  "celebrations",
  "puja",
  "pooja",
  "pujo",
]);

const FOOD_NAME_WORDS = [
  "restaurant",
  "cafe",
  "coffee",
  "bakery",
  "sweets",
  "sweet shop",
  "mishti",
  "kitchen",
  "dhaba",
  "biryani",
  "rolls",
  "roll centre",
  "food court",
  "food street",
  "street food",
  "snacks",
  "chaat",
  "tiffin",
  "canteen",
  "eatery",
  "bhojanalay",
  "pav bhaji",
  "momo",
];

function lower(value: string | null | undefined) {
  return value?.toLowerCase() ?? "";
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

/** Provider category → domain type, with no research context applied. */
export function mapRawPlaceType(
  rawType: string | null | undefined,
): PlaceType | null {
  if (!rawType?.trim()) {
    return null;
  }

  const lowered = rawType.toLowerCase();
  return RAW_TYPE_HINTS.find(({ match }) => lowered.includes(match))?.type ?? "other";
}

/**
 * Discriminating words from the festival name, e.g. "Durga Puja" → ["durga"],
 * "Ganesh Chaturthi" → ["ganesh", "chaturthi"].
 */
export function festivalTokens(...names: Array<string | null | undefined>) {
  const tokens = new Set<string>();

  for (const name of names) {
    for (const raw of lower(name).split(/[^a-z]+/)) {
      if (raw.length >= 4 && !FESTIVAL_TOKEN_STOPWORDS.has(raw)) {
        tokens.add(raw);
      }
    }
  }

  return [...tokens];
}

export type PlaceClassificationInput = {
  name: string;
  rawType?: string | null;
  description?: string | null;
  evidence?: string | null;
  festivalTokens?: string[];
  discoveryIntent?: DiscoveryIntent;
};

export type PlaceClassification = {
  type: PlaceType;
  reasons: string[];
};

/**
 * Semantic classification: research evidence and festival vocabulary outrank
 * the provider category, so a researched pandal listed as "temple" becomes
 * `pandal` while an unrelated temple stays `temple`.
 */
export function classifyPlaceType(
  input: PlaceClassificationInput,
): PlaceClassification {
  const reasons: string[] = [];
  const intent = input.discoveryIntent ?? "unknown";
  const name = lower(input.name);
  const context = [name, lower(input.description), lower(input.evidence)].join(" ");
  const rawType = mapRawPlaceType(input.rawType);
  const tokens = input.festivalTokens ?? [];

  const venueWord = includesAny(context, FESTIVAL_VENUE_WORDS);
  const festivalWord = tokens.some((token) => context.includes(token));
  const foodWord =
    includesAny(name, FOOD_NAME_WORDS) ||
    rawType === "food" ||
    rawType === "restaurant" ||
    rawType === "cafe";

  if (venueWord) {
    reasons.push("festival_venue_term");
  }
  if (festivalWord) {
    reasons.push("festival_name_term");
  }
  if (rawType) {
    reasons.push(`provider_type:${rawType}`);
  }

  // A festival venue term beats any provider category, including food ones:
  // "YUMPTY FOOD STREET" is food, but "Gauri Bari Sarbojanin Puja Pandal" is a
  // pandal even when Google calls it a temple or a club.
  if (venueWord) {
    return { type: "pandal", reasons };
  }

  if (intent === "festival") {
    if (festivalWord && !foodWord) {
      return { type: "pandal", reasons };
    }

    if (foodWord) {
      reasons.push("food_term_in_festival_search");
      return { type: rawType === "cafe" ? "cafe" : rawType === "restaurant" ? "restaurant" : "food", reasons };
    }

    if (rawType === "temple" || rawType == null) {
      return { type: "temple", reasons };
    }

    if (rawType === "other") {
      return { type: "event", reasons };
    }

    return { type: rawType, reasons };
  }

  if (intent === "food") {
    if (rawType === "cafe" || rawType === "restaurant" || rawType === "food") {
      return { type: rawType, reasons };
    }

    if (includesAny(name, ["cafe", "coffee"])) {
      return { type: "cafe", reasons };
    }

    if (includesAny(name, ["restaurant", "dhaba", "kitchen", "eatery"])) {
      return { type: "restaurant", reasons };
    }

    return { type: "food", reasons };
  }

  return { type: rawType ?? "other", reasons };
}

/** Festival-experience stops: the primary content of a festival itinerary. */
export function isFestivalPlaceType(type: PlaceType) {
  return type === "pandal" || type === "temple" || type === "event";
}

export function isFoodPlaceType(type: PlaceType) {
  return type === "food" || type === "restaurant" || type === "cafe";
}

/** Itinerary role of a persisted item, used by planning and validation. */
export function planItemRole(
  type: PlanItemType,
): "festival" | "food" | "support" {
  if (type === "pandal" || type === "event") {
    return "festival";
  }

  if (type === "food" || type === "restaurant" || type === "cafe") {
    return "food";
  }

  return "support";
}

/**
 * Domain type → itinerary item type. `plan_item_type` has no `temple`, and a
 * temple only enters a festival plan as a festival stop, so it maps to
 * `pandal` rather than the misleading `event` used previously.
 */
export function placeTypeToPlanItemType(
  type: PlaceType,
): Exclude<PlanItemType, "custom"> | null {
  switch (type) {
    case "pandal":
    case "temple":
      return "pandal";
    case "food":
    case "restaurant":
    case "cafe":
    case "parking":
    case "restroom":
    case "event":
      return type;
    default:
      return null;
  }
}
