import { UpstoxApiError } from "@/clients/upstoxClient";

const INSTRUMENT_KEY_PATTERN =
  /^[A-Z0-9_]+(\|[A-Za-z0-9][A-Za-z0-9\s._-]*)$/;

const ISIN_PATTERN = /^[A-Z]{2}[A-Z0-9]{10}$/;

const DATE_YYYY_MM_DD = /^\d{4}-\d{2}-\d{2}$/;

export function upstoxInputError(message: string): UpstoxApiError {
  return new UpstoxApiError(message, { kind: "invalid_request", status: 0 });
}

export function assertNonEmptyString(
  value: string,
  fieldName: string,
): asserts value is string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw upstoxInputError(`${fieldName} is required.`);
  }
}

export function assertInstrumentKey(instrumentKey: string): void {
  assertNonEmptyString(instrumentKey, "instrument_key");
  if (!INSTRUMENT_KEY_PATTERN.test(instrumentKey.trim())) {
    throw upstoxInputError("instrument_key is of invalid format.");
  }
}

export function assertInstrumentKeys(
  instrumentKeys: string[],
  options?: { max?: number; fieldName?: string },
): string[] {
  const fieldName = options?.fieldName ?? "instrument_key";
  if (!Array.isArray(instrumentKeys) || instrumentKeys.length === 0) {
    throw upstoxInputError(`${fieldName} is required.`);
  }
  const max = options?.max;
  if (max != null && instrumentKeys.length > max) {
    throw upstoxInputError(
      `Maximum instrument key limit exceeded (max ${max}).`,
    );
  }
  const normalized = instrumentKeys.map((k) => k.trim()).filter(Boolean);
  if (normalized.length === 0) {
    throw upstoxInputError(`${fieldName} is required.`);
  }
  for (const key of normalized) {
    assertInstrumentKey(key);
  }
  return normalized;
}

export function joinInstrumentKeys(instrumentKeys: string[]): string {
  return assertInstrumentKeys(instrumentKeys).join(",");
}

export function assertIsin(isin: string): void {
  assertNonEmptyString(isin, "isin");
  const trimmed = isin.trim().toUpperCase();
  if (!ISIN_PATTERN.test(trimmed)) {
    throw upstoxInputError("isin is of invalid format.");
  }
}

export function assertDateYyyyMmDd(date: string, fieldName = "date"): void {
  assertNonEmptyString(date, fieldName);
  if (!DATE_YYYY_MM_DD.test(date.trim())) {
    throw upstoxInputError(`${fieldName} must be YYYY-MM-DD.`);
  }
}

export function assertPagination(
  pageNumber: number | undefined,
  pageSize: number | undefined,
  limits: { pageMin: number; pageMax: number; sizeMin: number; sizeMax: number },
): void {
  if (pageNumber != null) {
    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < limits.pageMin ||
      pageNumber > limits.pageMax
    ) {
      throw upstoxInputError(
        `page_number must be between ${limits.pageMin} and ${limits.pageMax}.`,
      );
    }
  }
  if (pageSize != null) {
    if (
      !Number.isInteger(pageSize) ||
      pageSize < limits.sizeMin ||
      pageSize > limits.sizeMax
    ) {
      throw upstoxInputError(
        `page_size must be between ${limits.sizeMin} and ${limits.sizeMax}.`,
      );
    }
  }
}

export const HISTORICAL_CANDLE_UNITS = [
  "minutes",
  "hours",
  "days",
  "weeks",
  "months",
] as const;

export type HistoricalCandleUnit = (typeof HISTORICAL_CANDLE_UNITS)[number];

export function assertHistoricalUnit(unit: string): HistoricalCandleUnit {
  assertNonEmptyString(unit, "unit");
  if (
    !HISTORICAL_CANDLE_UNITS.includes(unit as HistoricalCandleUnit)
  ) {
    throw upstoxInputError(
      `unit must be one of: ${HISTORICAL_CANDLE_UNITS.join(", ")}.`,
    );
  }
  return unit as HistoricalCandleUnit;
}

export function assertHistoricalInterval(
  unit: HistoricalCandleUnit,
  interval: string,
): void {
  assertNonEmptyString(interval, "interval");
  const n = Number(interval);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    throw upstoxInputError("interval must be a positive integer.");
  }
  if (unit === "minutes" && (n < 1 || n > 300)) {
    throw upstoxInputError("interval for minutes must be between 1 and 300.");
  }
  if (unit === "hours" && (n < 1 || n > 5)) {
    throw upstoxInputError("interval for hours must be between 1 and 5.");
  }
  if (unit === "days" && n !== 1) {
    throw upstoxInputError("interval for days must be 1.");
  }
  if (unit === "weeks" && n !== 1) {
    throw upstoxInputError("interval for weeks must be 1.");
  }
  if (unit === "months" && (n < 1 || n > 3)) {
    throw upstoxInputError("interval for months must be between 1 and 3.");
  }
}

export const OHLC_INTERVALS = ["1d", "I1", "I30"] as const;

export type OhlcQuoteInterval = (typeof OHLC_INTERVALS)[number];

export function assertOhlcInterval(interval: string): OhlcQuoteInterval {
  assertNonEmptyString(interval, "interval");
  if (!OHLC_INTERVALS.includes(interval as OhlcQuoteInterval)) {
    throw upstoxInputError(
      `interval must be one of: ${OHLC_INTERVALS.join(", ")}.`,
    );
  }
  return interval as OhlcQuoteInterval;
}
