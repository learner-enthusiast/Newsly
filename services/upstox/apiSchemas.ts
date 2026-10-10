import { z } from "zod";
import { UpstoxMarketDataFeedClient } from "@/services/upstox/marketDataWebsocket";
import {
  HISTORICAL_CANDLE_UNITS,
  OHLC_INTERVALS,
} from "@/services/upstox/validation";

const INSTRUMENT_KEY_PATTERN =
  /^[A-Z0-9_]+(\|[A-Za-z0-9][A-Za-z0-9\s._-]*)$/;

export const instrumentKeySchema = z
  .string()
  .min(1)
  .regex(INSTRUMENT_KEY_PATTERN, "Invalid instrument_key format");

export const isinSchema = z
  .string()
  .min(1)
  .regex(/^[A-Z]{2}[A-Z0-9]{10}$/i, "Invalid ISIN")
  .transform((value) => value.toUpperCase());

export const dateYmdSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");

function instrumentKeysInput(max: number) {
  return z.object({
    instrumentKeys: z.array(instrumentKeySchema).min(1).max(max),
  });
}

function successEnvelope<T extends z.ZodTypeAny>(dataSchema: T) {
  return z
    .object({
      status: z.string(),
      data: dataSchema,
    })
    .passthrough();
}

const looseRecord = z.record(z.string(), z.unknown());

const fullMarketQuoteSchema = z
  .object({
    last_price: z.number().optional(),
    instrument_token: z.string().optional(),
    volume: z.number().optional(),
    ohlc: z
      .object({
        open: z.number().optional(),
        high: z.number().optional(),
        low: z.number().optional(),
        close: z.number().optional(),
        volume: z.number().optional(),
        ts: z.number().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const ohlcQuoteSchema = z
  .object({
    last_price: z.number().optional(),
    instrument_token: z.string().optional(),
  })
  .passthrough();

const ltpQuoteSchema = z
  .object({
    last_price: z.number().optional(),
    instrument_token: z.string().optional(),
  })
  .passthrough();

const optionGreekQuoteSchema = z
  .object({
    last_price: z.number().optional(),
    delta: z.number().optional(),
    gamma: z.number().optional(),
    theta: z.number().optional(),
    vega: z.number().optional(),
    iv: z.number().optional(),
  })
  .passthrough();

const candleTupleSchema = z.tuple([
  z.string(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number(),
  z.number().optional(),
]);

const fundamentalQueryOptionsSchema = z.object({
  type: z.enum(["consolidated", "standalone"]).optional(),
  timePeriod: z.enum(["yearly", "quarterly"]).optional(),
  fullStatement: z.boolean().optional(),
});

const derivativesAnalyticsInputSchema = z.object({
  instrumentKey: instrumentKeySchema,
  expiry: dateYmdSchema,
  date: dateYmdSchema,
});

const fiiDataTypeSchema = z.enum([
  "NSE_FO|INDEX_FUTURES",
  "NSE_FO|STOCK_FUTURES",
  "NSE_FO|INDEX_OPTIONS",
  "NSE_FO|STOCK_OPTIONS",
  "NSE_EQ|CASH",
]);

const marketFeedModeSchema = z.enum([
  "ltpc",
  "full",
  "full_d30",
  "option_greeks",
]);

export const upstoxApiSchemas = {
  getFullMarketQuotes: {
    input: instrumentKeysInput(500),
    output: successEnvelope(z.record(z.string(), fullMarketQuoteSchema)),
  },
  getOhlcQuotes: {
    input: z.object({
      instrumentKeys: z.array(instrumentKeySchema).min(1).max(500),
      interval: z.enum(OHLC_INTERVALS),
    }),
    output: successEnvelope(z.record(z.string(), ohlcQuoteSchema)),
  },
  getLtpQuotes: {
    input: instrumentKeysInput(500),
    output: successEnvelope(z.record(z.string(), ltpQuoteSchema)),
  },
  getOptionGreeks: {
    input: instrumentKeysInput(50),
    output: successEnvelope(z.record(z.string(), optionGreekQuoteSchema)),
  },
  getHistoricalCandles: {
    input: z.object({
      instrumentKey: instrumentKeySchema,
      unit: z.enum(HISTORICAL_CANDLE_UNITS),
      interval: z.string().min(1),
      toDate: dateYmdSchema,
      fromDate: dateYmdSchema.optional(),
    }),
    output: successEnvelope(
      z.object({
        candles: z.array(candleTupleSchema).optional(),
      }),
    ),
  },
  getIntradayCandles: {
    input: z.object({
      instrumentKey: instrumentKeySchema,
      unit: z.enum(["minutes", "hours"]),
      interval: z.string().min(1),
    }),
    output: successEnvelope(
      z.object({
        candles: z.array(candleTupleSchema).optional(),
      }),
    ),
  },
  getCompanyProfile: {
    input: z.object({ isin: isinSchema }),
    output: successEnvelope(
      z
        .object({
          company_profile: z.string().optional(),
          sector: z.string().optional(),
        })
        .passthrough(),
    ),
  },
  getKeyRatios: {
    input: z.object({ isin: isinSchema }),
    output: successEnvelope(
      z.array(
        z
          .object({
            name: z.string().optional(),
            company_value: z.string().optional(),
            sector_value: z.string().optional(),
          })
          .passthrough(),
      ),
    ),
  },
  getShareHoldings: {
    input: z.object({ isin: isinSchema }),
    output: successEnvelope(z.array(z.object({}).passthrough())),
  },
  getBalanceSheet: {
    input: z.object({
      isin: isinSchema,
      options: fundamentalQueryOptionsSchema.optional(),
    }),
    output: successEnvelope(looseRecord),
  },
  getIncomeStatement: {
    input: z.object({
      isin: isinSchema,
      options: fundamentalQueryOptionsSchema.optional(),
    }),
    output: successEnvelope(looseRecord),
  },
  getCashFlow: {
    input: z.object({
      isin: isinSchema,
      options: fundamentalQueryOptionsSchema.optional(),
    }),
    output: successEnvelope(looseRecord),
  },
  getCorporateActions: {
    input: z.object({ isin: isinSchema }),
    output: successEnvelope(looseRecord),
  },
  getCompetitors: {
    input: z.object({ isinOrInstrumentKey: z.string().min(1) }),
    output: successEnvelope(
      z.object({
        competitors: z.array(z.string()).optional(),
      }),
    ),
  },
  getFiiData: {
    input: z.object({
      interval: z.enum(["1D", "1M"]),
      dataTypes: z.array(fiiDataTypeSchema).optional(),
      from: dateYmdSchema.optional(),
    }),
    output: successEnvelope(
      z.record(z.string(), z.array(z.object({}).passthrough())),
    ),
  },
  getDiiData: {
    input: z.object({
      interval: z.enum(["1D", "1M"]),
      from: dateYmdSchema.optional(),
    }),
    output: successEnvelope(
      z.record(z.string(), z.array(z.object({}).passthrough())),
    ),
  },
  getOpenInterest: {
    input: derivativesAnalyticsInputSchema,
    output: successEnvelope(z.object({}).passthrough()),
  },
  getChangeInOpenInterest: {
    input: derivativesAnalyticsInputSchema.extend({
      intervalDays: z.number().int().positive(),
    }),
    output: successEnvelope(z.object({}).passthrough()),
  },
  getMaxPain: {
    input: derivativesAnalyticsInputSchema.extend({
      bucketIntervalMinutes: z.number().positive(),
    }),
    output: successEnvelope(z.object({}).passthrough()),
  },
  getPutCallRatio: {
    input: derivativesAnalyticsInputSchema.extend({
      bucketIntervalMinutes: z.number().positive(),
    }),
    output: successEnvelope(z.object({}).passthrough()),
  },
  getMarketHolidays: {
    input: z.object({ date: dateYmdSchema.optional() }),
    output: successEnvelope(z.array(z.object({}).passthrough())),
  },
  getMarketTimings: {
    input: z.object({ date: dateYmdSchema }),
    output: successEnvelope(z.array(z.object({}).passthrough())),
  },
  getExchangeStatus: {
    input: z.object({ exchange: z.string().min(1) }),
    output: successEnvelope(
      z.object({
        exchange: z.string().optional(),
        status: z.string().optional(),
        last_updated: z.number().optional(),
      }),
    ),
  },
  getOptionChain: {
    input: z.object({
      instrumentKey: instrumentKeySchema,
      expiryDate: dateYmdSchema,
    }),
    output: successEnvelope(z.array(z.object({}).passthrough())),
  },
  getOptionContracts: {
    input: z.object({
      underlyingInstrumentKey: instrumentKeySchema,
      expiryDate: dateYmdSchema.optional(),
    }),
    output: successEnvelope(z.array(z.object({}).passthrough())),
  },
  getBrokerageCharges: {
    input: z.object({
      instrumentToken: instrumentKeySchema,
      quantity: z.number().int().positive(),
      product: z.string().min(1),
      transactionType: z.enum(["BUY", "SELL"]).or(z.string().min(1)),
      price: z.number().positive(),
    }),
    output: successEnvelope(
      z.object({
        charges: z.object({}).passthrough().optional(),
      }),
    ),
  },
  getIpos: {
    input: z
      .object({
        status: z
          .enum(["open", "closed", "listed", "upcoming"])
          .optional(),
        issueType: z.enum(["regular", "sme"]).optional(),
        pageNumber: z.number().int().min(1).optional(),
        records: z.number().int().min(1).max(30).optional(),
      })
      .optional()
      .default({}),
    output: successEnvelope(z.array(z.object({}).passthrough())).and(
      z.object({
        meta_data: z.object({}).passthrough().optional(),
      }),
    ),
  },
  getIpoDetails: {
    input: z.object({ ipoId: z.string().min(1) }),
    output: successEnvelope(looseRecord),
  },
  getInstrumentNews: {
    input: z.object({
      instrumentKeys: z.array(instrumentKeySchema).min(1).max(30),
      pageNumber: z.number().int().min(1).max(100).optional(),
      pageSize: z.number().int().min(1).max(100).optional(),
    }),
    output: successEnvelope(
      z.record(
        z.string(),
        z.array(
          z
            .object({
              heading: z.string().optional(),
              summary: z.string().optional(),
              article_link: z.string().optional(),
              published_time: z.number().optional(),
            })
            .passthrough(),
        ),
      ),
    ).and(
      z.object({
        metadata: z.object({}).passthrough().optional(),
      }),
    ),
  },
  authorizeMarketDataFeed: {
    input: z.object({}).strict(),
    output: z.string().min(1),
  },
  createMarketDataStreamer: {
    input: z.object({
      instrumentKeys: z.array(instrumentKeySchema).optional(),
      mode: marketFeedModeSchema.optional(),
    }),
    output: z.custom<UpstoxMarketDataFeedClient>(
      (value) => value instanceof UpstoxMarketDataFeedClient,
      "Expected UpstoxMarketDataFeedClient",
    ),
  },
  testUpstoxConnection: {
    input: z.object({ exchange: z.string().min(1).optional() }),
    output: z.discriminatedUnion("ok", [
      z.object({
        ok: z.literal(true),
        exchange: z.string(),
        status: z.string(),
        lastUpdatedMs: z.number().nullable(),
      }),
      z.object({
        ok: z.literal(false),
        reason: z.enum(["not_configured", "api_error"]),
        message: z.string(),
      }),
    ]),
  },
  assertMarginApiNotUsed: {
    input: z.object({}).strict(),
    output: z.never(),
  },
} as const;

export type UpstoxApiSchemaKey = keyof typeof upstoxApiSchemas;
