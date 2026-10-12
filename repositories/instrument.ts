import type { Prisma } from "@/db/generated/client";
import { Prisma as PrismaRuntime } from "@/db/generated/client";
import { z } from "zod";
import { prisma } from "@/db";

type W = Prisma.InstrumentWhereInput;
const ci = "insensitive" as const;

// =====================================================================
// Validation schemas
// =====================================================================

const instrumentKeySchema = z.string().min(1, "instrumentKey is required");

const decimalInputSchema = z.union([
  z.number(),
  z.string(),
  z.instanceof(PrismaRuntime.Decimal),
]);

const inputJsonSchema = z.custom<Prisma.InputJsonValue>(
  (value) => value !== undefined,
);

const instrumentWriteSchema = z.object({
  instrumentKey: instrumentKeySchema,
  segment: z.string().min(1),
  exchange: z.string().min(1),
  instrumentType: z.string().min(1),
  tradingSymbol: z.string().min(1),
  name: z.string().min(1),
  exchangeToken: z.string().min(1),
  isin: z.string().min(1).nullable().optional(),
  shortName: z.string().min(1).nullable().optional(),
  securityType: z.string().min(1).nullable().optional(),
  lotSize: z.number().int().nullable().optional(),
  freezeQuantity: decimalInputSchema.nullable().optional(),
  tickSize: decimalInputSchema.nullable().optional(),
  expiry: z.coerce.date().nullable().optional(),
  strikePrice: decimalInputSchema.nullable().optional(),
  weekly: z.boolean().nullable().optional(),
  minimumLot: z.number().int().nullable().optional(),
  underlyingSymbol: z.string().min(1).nullable().optional(),
  underlyingKey: z.string().min(1).nullable().optional(),
  underlyingType: z.string().min(1).nullable().optional(),
  raw: inputJsonSchema,
});

const instrumentPutSchema = instrumentWriteSchema;
const instrumentPatchSchema = instrumentPutSchema.partial().extend({
  instrumentKey: instrumentKeySchema,
});

const symbolLookupSchema = z.object({
  segment: z.string().min(1),
  instrumentType: z.string().min(1),
  tradingSymbol: z.string().min(1),
});

const nameSearchSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  segment: z.string().min(1).optional(),
  instrumentType: z.string().min(1).optional(),
});

export const FUND_EQ_SEGMENTS = ["NSE_EQ", "BSE_EQ"] as const;
/** @deprecated use FUND_EQ_SEGMENTS */
export const ETF_EQ_SEGMENTS = FUND_EQ_SEGMENTS;

const fundSearchSchema = z.object({
  query: z.string().trim().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  /** Narrow to one equity segment; default is both NSE_EQ and BSE_EQ. */
  segment: z.enum(FUND_EQ_SEGMENTS).optional(),
});

export type InstrumentCreateInput = z.input<typeof instrumentWriteSchema>;
export type InstrumentPutInput = z.input<typeof instrumentPutSchema>;
export type InstrumentPatchInput = z.input<typeof instrumentPatchSchema>;
export type InstrumentSymbolLookup = z.input<typeof symbolLookupSchema>;
export type InstrumentNameSearchInput = z.input<typeof nameSearchSchema>;
export type FundSearchInput = z.input<typeof fundSearchSchema>;
export type EtfNameSearchInput = FundSearchInput;
export type MutualFundSearchInput = FundSearchInput;

// =====================================================================
// Classification rules (one place, used by both the DB filters and in-JS checks)
// =====================================================================
//
//   ISIN INE… / IN0–IN9… ─► stock / bond / govt security
//   ISIN INF… (fund unit) ─┬─ "ETF" or "BEES" in name / short name / symbol ─► ETF
//                          └─ otherwise, "fund" as a word in name / short name ─► MUTUAL FUND
//
// ETF is checked first: many ETFs are named after their AMC
// ("Bajaj Finserv Mutual Fund" / NIFTYBETF), so "fund" alone doesn't mean mutual fund.

const ETF_MARKERS = ["etf", "bees"];
const FUND_WORDS = ["fund", "mutual fund"];
const NON_STOCK_WORDS = ["etf", "bond", "mutual fund"];

type Classifiable = {
  segment: string;
  isin: string | null;
  name?: string;
  shortName?: string | null;
  tradingSymbol?: string;
};

/** Listed fund unit (ETF or mutual fund) on NSE/BSE equity: ISIN prefix INF. */
export const instrumentIsFundUnit = (
  i: Pick<Classifiable, "segment" | "isin">,
) =>
  (FUND_EQ_SEGMENTS as readonly string[]).includes(i.segment) &&
  (i.isin?.toUpperCase().startsWith("INF") ?? false);

const textOf = (i: Classifiable) =>
  [i.name, i.shortName, i.tradingSymbol]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

const containsWord = (text: string | null | undefined, word: string) =>
  text != null && new RegExp(`(^|\\s)${word}(\\s|$)`, "i").test(text);

/**
 * ETF check. Callers that pass only { segment, isin } (the old signature) get the old
 * ISIN-only answer; pass name / shortName / tradingSymbol for the precise answer.
 */
export function instrumentIsEtf(i: Classifiable): boolean {
  if (!instrumentIsFundUnit(i)) return false;
  const text = textOf(i);
  return text === "" ? true : ETF_MARKERS.some((m) => text.includes(m));
}

export function instrumentIsMutualFund(i: Classifiable): boolean {
  return (
    instrumentIsFundUnit(i) &&
    !instrumentIsEtf(i) &&
    FUND_WORDS.some(
      (w) => containsWord(i.name, w) || containsWord(i.shortName, w),
    )
  );
}

// ---------- The same rules as Prisma filters ----------

const TEXT_FIELDS = ["name", "shortName", "tradingSymbol"] as const;
type TextField = (typeof TEXT_FIELDS)[number];

/** Whole-word match, so "bond" hits "GOI Bond 2030" but not "Bondada Engineering". */
function hasWord(field: "name" | "shortName", word: string): W {
  return {
    OR: [
      { [field]: { equals: word, mode: ci } },
      { [field]: { startsWith: `${word} `, mode: ci } },
      { [field]: { endsWith: ` ${word}`, mode: ci } },
      { [field]: { contains: ` ${word} `, mode: ci } },
    ] as W[],
  };
}

/** NOT on a nullable column drops NULL rows in SQL, so keep nulls explicitly. */
function lacksWordInShortName(word: string): W {
  return { OR: [{ shortName: null }, { NOT: hasWord("shortName", word) }] };
}

function fundUnitWhere(segment?: (typeof FUND_EQ_SEGMENTS)[number]): W {
  return {
    segment: segment ?? { in: [...FUND_EQ_SEGMENTS] },
    isin: { startsWith: "INF" },
  };
}

const looksLikeEtf: W = {
  OR: TEXT_FIELDS.flatMap((f) =>
    ETF_MARKERS.map((m) => ({ [f]: { contains: m, mode: ci } }) as W),
  ),
};

/** `(name ILIKE '%ETF%' OR short_name ILIKE '%ETF%')` (+ BEES), fund-unit rows only. */
const etfMarkerInNameOrShort: W = {
  OR: ETF_MARKERS.flatMap((marker) => [
    { name: { contains: marker, mode: ci } },
    { shortName: { contains: marker, mode: ci } },
  ]),
};

const ETF_NAME_SHORT_FIELDS = ["name", "shortName"] as const satisfies readonly TextField[];

/**
 * Negation of looksLikeEtf that keeps rows with a NULL shortName (plain NOT would drop them).
 * Only `shortName` is nullable; a `{ name: null }` filter is rejected by Prisma.
 */
const lacksEtfMarker: W = {
  AND: TEXT_FIELDS.map((f) => {
    const noMarker = {
      AND: ETF_MARKERS.map((m) => ({
        NOT: { [f]: { contains: m, mode: ci } },
      })),
    } as W;
    return f === "shortName" ? ({ OR: [{ shortName: null }, noMarker] } as W) : noMarker;
  }),
};

const looksLikeMutualFund: W = {
  AND: [
    lacksEtfMarker,
    {
      OR: FUND_WORDS.flatMap((w) => [
        hasWord("name", w),
        hasWord("shortName", w),
      ]),
    },
  ],
};

/** Stocks only: no ETF / bond / mutual fund wording, and no fund-unit ISINs. */
const excludeFundsAndBonds: W = {
  AND: [
    ...NON_STOCK_WORDS.map((w) => ({ NOT: hasWord("name", w) })),
    ...NON_STOCK_WORDS.map(lacksWordInShortName),
    { OR: [{ isin: null }, { NOT: { isin: { startsWith: "INF" } } }] },
  ],
};

// =====================================================================
// Search engine: prefix matches first, then "every word appears somewhere"
// =====================================================================

/**
 *  "nifty"      → prefix:  NIFTYBETF, Nifty…            (best matches on top)
 *  "nifty etf"  → words:   "Bajaj Nifty 50 ETF"          (each word anywhere, any field)
 *  "mutual"     → words:   "Bajaj Finserv Mutual Fund"   (middle of the name)
 */
function queryMatch(
  q: string,
  fields: readonly TextField[],
): { prefix: W; words: W } {
  const words = q.split(/\s+/).filter(Boolean);
  return {
    prefix: {
      OR: fields.map((f) => ({ [f]: { startsWith: q, mode: ci } }) as W),
    },
    words: {
      AND: words.map((w) => ({
        OR: fields.map((f) => ({ [f]: { contains: w, mode: ci } }) as W),
      })),
    },
  };
}

const ORDER_BY: Prisma.InstrumentOrderByWithRelationInput[] = [
  { name: "asc" },
  { instrumentKey: "asc" },
];

async function searchPrefixThenWords(
  base: W,
  query: string,
  limit: number,
  fields: readonly TextField[] = TEXT_FIELDS,
) {
  const { prefix, words } = queryMatch(query, fields);

  const first = await prisma.instrument.findMany({
    where: { AND: [base, prefix] },
    orderBy: ORDER_BY,
    take: limit,
  });
  if (first.length >= limit) return first;

  const rest = await prisma.instrument.findMany({
    where: {
      AND: [
        base,
        words,
        { instrumentKey: { notIn: first.map((r) => r.instrumentKey) } },
      ],
    },
    orderBy: ORDER_BY,
    take: limit - first.length,
  });
  return [...first, ...rest];
}

function optionalFilters(p: {
  segment?: string;
  instrumentType?: string;
}): W[] {
  return [
    p.segment ? { segment: p.segment } : {},
    p.instrumentType ? { instrumentType: p.instrumentType } : {},
  ];
}

// =====================================================================
// Reads
// =====================================================================

export async function getInstrumentByKey(instrumentKey: string) {
  return await prisma.instrument.findUnique({
    where: { instrumentKey: instrumentKeySchema.parse(instrumentKey) },
  });
}

/** Symbol → key lookup ("RELIANCE" on NSE_EQ). Uses `idx_instruments_symbol`. */
export async function findInstrumentsByTradingSymbol(
  input: InstrumentSymbolLookup,
) {
  const parsed = symbolLookupSchema.parse(input);
  return await prisma.instrument.findMany({
    where: {
      segment: parsed.segment,
      instrumentType: parsed.instrumentType,
      tradingSymbol: parsed.tradingSymbol,
    },
  });
}

export async function findInstrumentByTradingSymbol(
  input: InstrumentSymbolLookup,
) {
  const parsed = symbolLookupSchema.parse(input);
  return await prisma.instrument.findFirst({
    where: {
      segment: parsed.segment,
      instrumentType: parsed.instrumentType,
      tradingSymbol: parsed.tradingSymbol,
    },
  });
}

/** Any instrument by `name` (prefix first, then words anywhere). No category filter. */
export async function searchInstrumentsByName(
  input: InstrumentNameSearchInput,
) {
  const parsed = nameSearchSchema.parse(input);
  return searchPrefixThenWords(
    { AND: optionalFilters(parsed) },
    parsed.query,
    parsed.limit ?? 25,
    ["name"],
  );
}

/** Any instrument by `shortName` (prefix first, then words anywhere). No category filter. */
export async function searchInstrumentsByShortName(
  input: InstrumentNameSearchInput,
) {
  const parsed = nameSearchSchema.parse(input);
  return searchPrefixThenWords(
    { AND: optionalFilters(parsed) },
    parsed.query,
    parsed.limit ?? 25,
    ["shortName"],
  );
}

/** Stocks: name / short name / symbol, excluding ETFs, bonds and mutual funds. */
export async function searchInstrumentsByNameOrShortName(
  input: InstrumentNameSearchInput,
) {
  const parsed = nameSearchSchema.parse(input);
  return searchPrefixThenWords(
    { AND: [...optionalFilters(parsed), excludeFundsAndBonds] },
    parsed.query,
    parsed.limit ?? 25,
  );
}

/**
 * ETFs: INF fund units where name or short_name contains ETF/BEES, and the query
 * matches name or short_name (prefix matches ranked first, then word contains).
 *
 * Equivalent to:
 *   (name ILIKE '%ETF%' OR short_name ILIKE '%ETF%' …)
 *   AND (name ILIKE '%query%' OR short_name ILIKE '%query%' …)
 */
export async function searchEtfsByNameOrShortName(input: EtfNameSearchInput) {
  const parsed = fundSearchSchema.parse(input);
  return searchPrefixThenWords(
    { AND: [fundUnitWhere(parsed.segment), etfMarkerInNameOrShort] },
    parsed.query.trim(),
    parsed.limit ?? 25,
    ETF_NAME_SHORT_FIELDS,
  );
}

/** @deprecated alias — searches name and short_name (same as {@link searchEtfsByNameOrShortName}). */
export async function searchEtfsByName(input: EtfNameSearchInput) {
  return searchEtfsByNameOrShortName(input);
}

/** Mutual funds: fund-unit ISIN, "fund"/"mutual fund" in name or short name, and not an ETF. */
export async function searchMutualFundsByNameOrShortName(
  input: MutualFundSearchInput,
) {
  const parsed = fundSearchSchema.parse(input);
  return searchPrefixThenWords(
    { AND: [fundUnitWhere(parsed.segment), looksLikeMutualFund] },
    parsed.query,
    parsed.limit ?? 25,
  );
}

// =====================================================================
// Writes
// =====================================================================

export async function createInstrument(input: InstrumentCreateInput) {
  return await prisma.instrument.create({
    data: instrumentWriteSchema.parse(
      input,
    ) satisfies Prisma.InstrumentCreateInput,
  });
}

export async function upsertInstrument(input: InstrumentPutInput) {
  const data = instrumentPutSchema.parse(input);
  const { instrumentKey, ...update } = data;
  return await prisma.instrument.upsert({
    where: { instrumentKey },
    create: data,
    update,
  });
}

export async function patchInstrument(input: InstrumentPatchInput) {
  const { instrumentKey, ...data } = instrumentPatchSchema.parse(input);
  return await prisma.instrument.update({
    where: { instrumentKey },
    data: data as Prisma.InstrumentUpdateInput,
  });
}

export async function upsertManyInstruments(inputs: InstrumentPutInput[]) {
  if (inputs.length === 0) return { count: 0 };

  const rows = inputs.map((row) => instrumentPutSchema.parse(row));
  await prisma.$transaction(
    rows.map((row) => {
      const { instrumentKey, ...update } = row;
      return prisma.instrument.upsert({
        where: { instrumentKey },
        create: row,
        update,
      });
    }),
  );
  return { count: rows.length };
}
