/**
 * Number extraction + normalisation shared by the fact checker and publishing
 * guards. "₹1,200 cr", "1200 crore" and "₹1,200 करोड़" all normalise to
 * { value: 1200, scale: "crore" }; Devanagari digits are converted first.
 */

export type NumberScale =
  | "thousand"
  | "lakh"
  | "million"
  | "crore"
  | "billion"
  | "trillion"
  | "percent";

export type NumberToken = {
  raw: string;
  value: number;
  scale: NumberScale | null;
};

const SCALE_ALIASES: Record<string, NumberScale> = {
  k: "thousand",
  thousand: "thousand",
  "हज़ार": "thousand",
  "हजार": "thousand",
  lakh: "lakh",
  lakhs: "lakh",
  lac: "lakh",
  "लाख": "lakh",
  mn: "million",
  million: "million",
  millions: "million",
  cr: "crore",
  "cr.": "crore",
  crore: "crore",
  crores: "crore",
  "करोड़": "crore",
  "करोड": "crore",
  bn: "billion",
  billion: "billion",
  billions: "billion",
  "अरब": "billion",
  "बिलियन": "billion",
  "मिलियन": "million",
  "ट्रिलियन": "trillion",
  "परसेंट": "percent",
  tn: "trillion",
  trillion: "trillion",
  "%": "percent",
  percent: "percent",
  "per cent": "percent",
  "प्रतिशत": "percent",
  "फीसदी": "percent",
  "फ़ीसदी": "percent",
};

const SCALE_MULTIPLIER: Partial<Record<NumberScale, number>> = {
  thousand: 1e3,
  lakh: 1e5,
  million: 1e6,
  crore: 1e7,
  billion: 1e9,
  trillion: 1e12,
};

const DEVANAGARI_DIGITS = "०१२३४५६७८९";

export function toAsciiDigits(text: string): string {
  return text.replace(/[०-९]/g, (d) => String(DEVANAGARI_DIGITS.indexOf(d)));
}

// Latin scale words must end at a word boundary ("5 km" is not "5 k").
const NUMBER_PATTERN =
  /(\d+(?:,\d+)*(?:\.\d+)?)(?:\s*(%|per cent|percent|crores?|cr\.?(?![a-z])|lakhs?(?![a-z])|lac(?![a-z])|millions?|mn(?![a-z])|billions?|bn(?![a-z])|trillion|tn(?![a-z])|thousand|k(?![a-z])|करोड़|करोड|लाख|अरब|बिलियन|मिलियन|ट्रिलियन|हज़ार|हजार|प्रतिशत|परसेंट|फ़ीसदी|फीसदी))?/gi;

export function extractNumbers(text: string): NumberToken[] {
  const ascii = toAsciiDigits(text);
  const tokens: NumberToken[] = [];
  for (const match of ascii.matchAll(NUMBER_PATTERN)) {
    // Skip digits glued to letters (e.g. "Q3", "G20", "4G") — labels, not quantities.
    const start = match.index ?? 0;
    const before = ascii[start - 1];
    if (before && /[A-Za-z]/.test(before)) {
      continue;
    }
    const value = Number(match[1].replace(/,/g, ""));
    if (!Number.isFinite(value)) {
      continue;
    }
    const scaleWord = match[2]?.toLowerCase();
    tokens.push({
      raw: match[0].trim(),
      value,
      scale: scaleWord ? (SCALE_ALIASES[scaleWord] ?? null) : null,
    });
  }
  return tokens;
}

function absoluteValue(token: NumberToken): number | null {
  if (!token.scale || token.scale === "percent") {
    return null;
  }
  const multiplier = SCALE_MULTIPLIER[token.scale];
  return multiplier ? token.value * multiplier : null;
}

function nearlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(a) * 1e-9);
}

/**
 * Same value (and compatible scale), or same absolute amount — across scales
 * (120 bn = 12,000 cr) or against a written-out number (25000000000 = 25 bn).
 */
export function numbersMatch(script: NumberToken, fact: NumberToken): boolean {
  if (nearlyEqual(script.value, fact.value)) {
    return (
      script.scale == null || fact.scale == null || script.scale === fact.scale
    );
  }
  const a = absoluteValue(script) ?? (script.scale == null ? script.value : null);
  const b = absoluteValue(fact) ?? (fact.scale == null ? fact.value : null);
  return a != null && b != null && nearlyEqual(a, b);
}

/** Numbers in `text` that match nothing in `allowed`. */
export function unsupportedNumbers(
  text: string,
  allowed: NumberToken[],
): NumberToken[] {
  return extractNumbers(text).filter(
    (token) => !allowed.some((fact) => numbersMatch(token, fact)),
  );
}

/** Splits on . ! ? and the Devanagari danda, keeping the punctuation. */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?।])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Whitespace word count (works for Devanagari too). */
export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/** Case/quote-mark/whitespace-insensitive form for verbatim quote comparison. */
export function normaliseQuoteText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”„"]/g, '"')
    .replace(/[‘’']/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const DOUBLE_QUOTED = /["“„]([^"“”„]{4,}?)["”]/g;
// Single quotes only when they wrap a phrase, so apostrophes ("he's") are ignored.
const SINGLE_QUOTED = /(?:^|[\s(])['‘]([^'‘’]{4,}?)['’](?=[\s.,!?;:)]|$)/g;

/** Phrases inside quotation marks, without edge punctuation ("minefield." → "minefield"). */
export function extractQuotedSpans(text: string): string[] {
  return [...text.matchAll(DOUBLE_QUOTED), ...text.matchAll(SINGLE_QUOTED)]
    .map((m) => m[1].replace(/^[\s.,!?;:…।-]+|[\s.,!?;:…।-]+$/g, ""))
    .filter(Boolean);
}
