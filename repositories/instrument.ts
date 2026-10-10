import type { Prisma } from "@/db/generated/client";
import { Prisma as PrismaRuntime } from "@/db/generated/client";
import { z } from "zod";
import { prisma } from "@/db";

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

function toCreateData(
  input: z.infer<typeof instrumentWriteSchema>,
): Prisma.InstrumentCreateInput {
  return input;
}

function toUpdateData(
  input: Prisma.InstrumentUpdateInput,
): Prisma.InstrumentUpdateInput {
  return input;
}

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
  query: z.string().min(1),
  limit: z.number().int().min(1).max(100).optional(),
  segment: z.string().min(1).optional(),
  instrumentType: z.string().min(1).optional(),
});

export type InstrumentCreateInput = z.input<typeof instrumentWriteSchema>;
export type InstrumentPutInput = z.input<typeof instrumentPutSchema>;
export type InstrumentPatchInput = z.input<typeof instrumentPatchSchema>;
export type InstrumentSymbolLookup = z.input<typeof symbolLookupSchema>;
export type InstrumentNameSearchInput = z.input<typeof nameSearchSchema>;

function normalizeLookupQuery(query: string): string {
  return query.trim();
}

export async function getInstrumentByKey(instrumentKey: string) {
  return prisma.instrument.findUnique({
    where: { instrumentKey: instrumentKeySchema.parse(instrumentKey) },
  });
}

/** Symbol → key lookup ("RELIANCE" on NSE_EQ). Uses `idx_instruments_symbol`. */
export async function findInstrumentsByTradingSymbol(
  input: InstrumentSymbolLookup,
) {
  const parsed = symbolLookupSchema.parse(input);
  return prisma.instrument.findMany({
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
  return prisma.instrument.findFirst({
    where: {
      segment: parsed.segment,
      instrumentType: parsed.instrumentType,
      tradingSymbol: parsed.tradingSymbol,
    },
  });
}

/** Prefix search on `name` (case-insensitive). Uses `idx_instruments_name`. */
export async function searchInstrumentsByName(input: InstrumentNameSearchInput) {
  const parsed = nameSearchSchema.parse(input);
  const q = normalizeLookupQuery(parsed.query);
  return prisma.instrument.findMany({
    where: {
      name: { startsWith: q, mode: "insensitive" },
      ...(parsed.segment ? { segment: parsed.segment } : {}),
      ...(parsed.instrumentType
        ? { instrumentType: parsed.instrumentType }
        : {}),
    },
    orderBy: [{ name: "asc" }, { instrumentKey: "asc" }],
    take: parsed.limit ?? 25,
  });
}

/** Prefix search on `short_name` (case-insensitive). Uses `idx_instruments_short_name`. */
export async function searchInstrumentsByShortName(
  input: InstrumentNameSearchInput,
) {
  const parsed = nameSearchSchema.parse(input);
  const q = normalizeLookupQuery(parsed.query);
  return prisma.instrument.findMany({
    where: {
      shortName: { startsWith: q, mode: "insensitive" },
      ...(parsed.segment ? { segment: parsed.segment } : {}),
      ...(parsed.instrumentType
        ? { instrumentType: parsed.instrumentType }
        : {}),
    },
    orderBy: [{ shortName: "asc" }, { instrumentKey: "asc" }],
    take: parsed.limit ?? 25,
  });
}

/** Match `name` or `short_name` prefix for autocomplete-style lookups. */
export async function searchInstrumentsByNameOrShortName(
  input: InstrumentNameSearchInput,
) {
  const parsed = nameSearchSchema.parse(input);
  const q = normalizeLookupQuery(parsed.query);
  const segmentFilter = parsed.segment ? { segment: parsed.segment } : {};
  const typeFilter = parsed.instrumentType
    ? { instrumentType: parsed.instrumentType }
    : {};

  return prisma.instrument.findMany({
    where: {
      ...segmentFilter,
      ...typeFilter,
      OR: [
        { name: { startsWith: q, mode: "insensitive" } },
        { shortName: { startsWith: q, mode: "insensitive" } },
      ],
    },
    orderBy: [{ name: "asc" }, { instrumentKey: "asc" }],
    take: parsed.limit ?? 25,
  });
}

export async function createInstrument(input: InstrumentCreateInput) {
  return prisma.instrument.create({
    data: toCreateData(instrumentWriteSchema.parse(input)),
  });
}

export async function upsertInstrument(input: InstrumentPutInput) {
  const data = instrumentPutSchema.parse(input);
  const { instrumentKey, ...update } = data;
  return prisma.instrument.upsert({
    where: { instrumentKey },
    create: toCreateData(data),
    update: toUpdateData(update),
  });
}

export async function patchInstrument(input: InstrumentPatchInput) {
  const parsed = instrumentPatchSchema.parse(input);
  const { instrumentKey, ...data } = parsed;
  return prisma.instrument.update({
    where: { instrumentKey },
    data: toUpdateData(data as Prisma.InstrumentUpdateInput),
  });
}

export async function upsertManyInstruments(inputs: InstrumentPutInput[]) {
  if (inputs.length === 0) {
    return { count: 0 };
  }

  const rows = inputs.map((row) => instrumentPutSchema.parse(row));
  await prisma.$transaction(
    rows.map((row) => {
      const { instrumentKey, ...update } = row;
      return prisma.instrument.upsert({
        where: { instrumentKey },
        create: toCreateData(row),
        update: toUpdateData(update),
      });
    }),
  );

  return { count: rows.length };
}
