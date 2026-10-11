import type { z } from "zod";
import { tool } from "@/lib/observability";
import { upstoxApiSchemas } from "@/services/upstox/apiSchemas";
import { getBrokerageCharges } from "@/services/upstox/charges";
import {
  getBalanceSheet,
  getCashFlow,
  getCompanyProfile,
  getCompetitors,
  getCorporateActions,
  getIncomeStatement,
  getKeyRatios,
  getShareHoldings,
} from "@/services/upstox/fundamentals";
import {
  getHistoricalCandles,
  getIntradayCandles,
} from "@/services/upstox/historicalData";
import { getIpoDetails, getIpos } from "@/services/upstox/ipo";
import { assertMarginApiNotUsed } from "@/services/upstox/margins";
import {
  authorizeMarketDataFeed,
  createMarketDataStreamer,
} from "@/services/upstox/marketDataWebsocket";
import {
  getChangeInOpenInterest,
  getDiiData,
  getExchangeStatus,
  getFiiData,
  getMarketHolidays,
  getMarketTimings,
  getMaxPain,
  getOpenInterest,
  getPutCallRatio,
} from "@/services/upstox/marketInformation";
import {
  getFullMarketQuotes,
  getLtpQuotes,
  getOhlcQuotes,
  getOptionGreeks,
} from "@/services/upstox/marketQuote";
import { getInstrumentNews } from "@/services/upstox/news";
import {
  getOptionChain,
  getOptionContracts,
} from "@/services/upstox/optionChain";
import { testUpstoxConnection } from "@/services/upstox/testConnection";

export type UpstoxApiDefinition<
  TInput = unknown,
  TOutput = unknown,
  TFn extends (...args: never[]) => unknown = (...args: never[]) => unknown,
> = {
  key: string;
  apiFunctionName: string;
  detailedDescription: string;
  input: string;
  output: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  fn: TFn;
};

function defineUpstoxApi<
  TInput,
  TOutput,
  TFn extends (...args: never[]) => unknown,
>(
  key: string,
  apiFunctionName: string,
  detailedDescription: string,
  input: string,
  output: string,
  inputSchema: z.ZodType<TInput>,
  outputSchema: z.ZodType<TOutput>,
  fn: TFn,
): UpstoxApiDefinition<TInput, TOutput, TFn> {
  return {
    key,
    apiFunctionName,
    detailedDescription,
    input,
    output,
    inputSchema,
    outputSchema,
    fn: tool(`upstox.${key}`, fn) as TFn,
  };
}

/**
 * Catalog of Dainik Samachar Upstox read-only APIs (Analytics Token / GET).
 * Each entry includes metadata for agents, docs, and programmatic dispatch.
 */
export const upstoxApis = {
  getFullMarketQuotes: defineUpstoxApi(
    "getFullMarketQuotes",
    "getFullMarketQuotes",
    "Full market quote snapshot (LTP, OHLC, depth fields per instrument). GET /v3/market-quote/quotes. Up to 500 instrument keys per call.",
    "instrumentKeys: string[]",
    "UpstoxFullMarketQuoteResponse",
    upstoxApiSchemas.getFullMarketQuotes.input,
    upstoxApiSchemas.getFullMarketQuotes.output,
    getFullMarketQuotes,
  ),
  getOhlcQuotes: defineUpstoxApi(
    "getOhlcQuotes",
    "getOhlcQuotes",
    "Open/high/low/close quotes for instruments at a supported interval. GET /v3/market-quote/ohlc.",
    "instrumentKeys: string[], interval: OhlcQuoteInterval | string (1d | I1 | I30)",
    "UpstoxOhlcQuoteResponse",
    upstoxApiSchemas.getOhlcQuotes.input,
    upstoxApiSchemas.getOhlcQuotes.output,
    getOhlcQuotes,
  ),
  getLtpQuotes: defineUpstoxApi(
    "getLtpQuotes",
    "getLtpQuotes",
    "Last traded price only for up to 500 instruments. GET /v3/market-quote/ltp.",
    "instrumentKeys: string[]",
    "UpstoxLtpQuoteResponse",
    upstoxApiSchemas.getLtpQuotes.input,
    upstoxApiSchemas.getLtpQuotes.output,
    getLtpQuotes,
  ),
  getOptionGreeks: defineUpstoxApi(
    "getOptionGreeks",
    "getOptionGreeks",
    "Option greek quotes for derivative instrument keys. GET /v3/market-quote/option-greek. Max 50 keys.",
    "instrumentKeys: string[]",
    "UpstoxOptionGreekQuoteResponse",
    upstoxApiSchemas.getOptionGreeks.input,
    upstoxApiSchemas.getOptionGreeks.output,
    getOptionGreeks,
  ),
  getHistoricalCandles: defineUpstoxApi(
    "getHistoricalCandles",
    "getHistoricalCandles",
    "Historical OHLCV candles between dates. GET /v3/historical-candle/{instrument_key}/{unit}/{interval}/{to_date}[/{from_date}].",
    "params: HistoricalCandlesParams { instrumentKey, unit, interval, toDate, fromDate? }",
    "UpstoxHistoricalCandlesResponse",
    upstoxApiSchemas.getHistoricalCandles.input,
    upstoxApiSchemas.getHistoricalCandles.output,
    getHistoricalCandles,
  ),
  getIntradayCandles: defineUpstoxApi(
    "getIntradayCandles",
    "getIntradayCandles",
    "Current-session intraday candles (minutes or hours unit only). GET /v3/historical-candle/intraday/...",
    "params: IntradayCandlesParams { instrumentKey, unit: minutes|hours, interval }",
    "UpstoxHistoricalCandlesResponse",
    upstoxApiSchemas.getIntradayCandles.input,
    upstoxApiSchemas.getIntradayCandles.output,
    getIntradayCandles,
  ),
  getCompanyProfile: defineUpstoxApi(
    "getCompanyProfile",
    "getCompanyProfile",
    "Company profile and metadata for an equity ISIN. GET /v2/fundamentals/{isin}/profile.",
    "isin: string (12-char ISIN)",
    "UpstoxCompanyProfileResponse",
    upstoxApiSchemas.getCompanyProfile.input,
    upstoxApiSchemas.getCompanyProfile.output,
    getCompanyProfile,
  ),
  getKeyRatios: defineUpstoxApi(
    "getKeyRatios",
    "getKeyRatios",
    "Fundamental key ratios for an ISIN. GET /v2/fundamentals/{isin}/key-ratios.",
    "isin: string",
    "UpstoxKeyRatiosResponse",
    upstoxApiSchemas.getKeyRatios.input,
    upstoxApiSchemas.getKeyRatios.output,
    getKeyRatios,
  ),
  getShareHoldings: defineUpstoxApi(
    "getShareHoldings",
    "getShareHoldings",
    "Shareholding pattern for an ISIN. GET /v2/fundamentals/{isin}/share-holdings.",
    "isin: string",
    "UpstoxShareHoldingsResponse",
    upstoxApiSchemas.getShareHoldings.input,
    upstoxApiSchemas.getShareHoldings.output,
    getShareHoldings,
  ),
  getBalanceSheet: defineUpstoxApi(
    "getBalanceSheet",
    "getBalanceSheet",
    "Balance sheet (consolidated/standalone, yearly/quarterly). GET /v2/fundamentals/{isin}/balance-sheet.",
    "isin: string, options?: FundamentalQueryOptions { type?, timePeriod?, fullStatement? }",
    "UpstoxSuccessEnvelope<unknown>",
    upstoxApiSchemas.getBalanceSheet.input,
    upstoxApiSchemas.getBalanceSheet.output,
    getBalanceSheet,
  ),
  getIncomeStatement: defineUpstoxApi(
    "getIncomeStatement",
    "getIncomeStatement",
    "Income / P&L statement. GET /v2/fundamentals/{isin}/income-statement.",
    "isin: string, options?: FundamentalQueryOptions",
    "UpstoxSuccessEnvelope<unknown>",
    upstoxApiSchemas.getIncomeStatement.input,
    upstoxApiSchemas.getIncomeStatement.output,
    getIncomeStatement,
  ),
  getCashFlow: defineUpstoxApi(
    "getCashFlow",
    "getCashFlow",
    "Cash flow statement. GET /v2/fundamentals/{isin}/cash-flow.",
    "isin: string, options?: FundamentalQueryOptions",
    "UpstoxSuccessEnvelope<unknown>",
    upstoxApiSchemas.getCashFlow.input,
    upstoxApiSchemas.getCashFlow.output,
    getCashFlow,
  ),
  getCorporateActions: defineUpstoxApi(
    "getCorporateActions",
    "getCorporateActions",
    "Corporate actions (dividends, splits, etc.) for an ISIN. GET /v2/fundamentals/{isin}/corporate-actions.",
    "isin: string",
    "UpstoxSuccessEnvelope<unknown>",
    upstoxApiSchemas.getCorporateActions.input,
    upstoxApiSchemas.getCorporateActions.output,
    getCorporateActions,
  ),
  getCompetitors: defineUpstoxApi(
    "getCompetitors",
    "getCompetitors",
    "Peer / competitor list for an ISIN or instrument key. GET /v2/fundamentals/{identifier}/competitors.",
    "isinOrInstrumentKey: string",
    "UpstoxCompetitorsResponse",
    upstoxApiSchemas.getCompetitors.input,
    upstoxApiSchemas.getCompetitors.output,
    getCompetitors,
  ),
  getFiiData: defineUpstoxApi(
    "getFiiData",
    "getFiiData",
    "FII activity by data type and interval. GET /v2/market/fii.",
    "options: FiiDiiQueryOptions { interval: 1D|1M, dataTypes?, from? }",
    "UpstoxFiiDiiResponse",
    upstoxApiSchemas.getFiiData.input,
    upstoxApiSchemas.getFiiData.output,
    getFiiData,
  ),
  getDiiData: defineUpstoxApi(
    "getDiiData",
    "getDiiData",
    "DII cash-market activity. GET /v2/market/dii.",
    "options: { interval: 1D|1M, from? }",
    "UpstoxFiiDiiResponse",
    upstoxApiSchemas.getDiiData.input,
    upstoxApiSchemas.getDiiData.output,
    getDiiData,
  ),
  getOpenInterest: defineUpstoxApi(
    "getOpenInterest",
    "getOpenInterest",
    "Open interest for an underlying/expiry on a date. GET /v2/market/oi.",
    "query: DerivativesAnalyticsQuery { instrumentKey, expiry, date }",
    "UpstoxOpenInterestResponse",
    upstoxApiSchemas.getOpenInterest.input,
    upstoxApiSchemas.getOpenInterest.output,
    getOpenInterest,
  ),
  getChangeInOpenInterest: defineUpstoxApi(
    "getChangeInOpenInterest",
    "getChangeInOpenInterest",
    "Change in open interest over interval days. GET /v2/market/change-oi.",
    "query: ChangeInOpenInterestQuery { instrumentKey, expiry, date, intervalDays }",
    "UpstoxChangeOiResponse",
    upstoxApiSchemas.getChangeInOpenInterest.input,
    upstoxApiSchemas.getChangeInOpenInterest.output,
    getChangeInOpenInterest,
  ),
  getMaxPain: defineUpstoxApi(
    "getMaxPain",
    "getMaxPain",
    "Max pain strike for options chain on a date. GET /v2/market/max-pain.",
    "query: BucketedAnalyticsQuery { instrumentKey, expiry, date, bucketIntervalMinutes }",
    "UpstoxMaxPainResponse",
    upstoxApiSchemas.getMaxPain.input,
    upstoxApiSchemas.getMaxPain.output,
    getMaxPain,
  ),
  getPutCallRatio: defineUpstoxApi(
    "getPutCallRatio",
    "getPutCallRatio",
    "Put/call ratio time series for derivatives. GET /v2/market/pcr.",
    "query: BucketedAnalyticsQuery { instrumentKey, expiry, date, bucketIntervalMinutes }",
    "UpstoxPcrResponse",
    upstoxApiSchemas.getPutCallRatio.input,
    upstoxApiSchemas.getPutCallRatio.output,
    getPutCallRatio,
  ),
  getMarketHolidays: defineUpstoxApi(
    "getMarketHolidays",
    "getMarketHolidays",
    "Exchange holiday calendar (all dates or one date). GET /v2/market/holidays[/{date}].",
    "date?: string (YYYY-MM-DD)",
    "UpstoxMarketHolidaysResponse",
    upstoxApiSchemas.getMarketHolidays.input,
    upstoxApiSchemas.getMarketHolidays.output,
    getMarketHolidays,
  ),
  getMarketTimings: defineUpstoxApi(
    "getMarketTimings",
    "getMarketTimings",
    "Market session timings for a calendar date. GET /v2/market/timings/{date}.",
    "date: string (YYYY-MM-DD)",
    "UpstoxMarketTimingsResponse",
    upstoxApiSchemas.getMarketTimings.input,
    upstoxApiSchemas.getMarketTimings.output,
    getMarketTimings,
  ),
  getExchangeStatus: defineUpstoxApi(
    "getExchangeStatus",
    "getExchangeStatus",
    "Live open/closed status for an exchange (e.g. NSE). GET /v2/market/status/{exchange}.",
    "exchange: string",
    "UpstoxExchangeStatusResponse",
    upstoxApiSchemas.getExchangeStatus.input,
    upstoxApiSchemas.getExchangeStatus.output,
    getExchangeStatus,
  ),
  getOptionChain: defineUpstoxApi(
    "getOptionChain",
    "getOptionChain",
    "Full option chain (puts/calls) for underlying and expiry. GET /v2/option/chain.",
    "query: OptionChainQuery { instrumentKey, expiryDate }",
    "UpstoxOptionChainResponse",
    upstoxApiSchemas.getOptionChain.input,
    upstoxApiSchemas.getOptionChain.output,
    getOptionChain,
  ),
  getOptionContracts: defineUpstoxApi(
    "getOptionContracts",
    "getOptionContracts",
    "List option contract instrument keys for an underlying. GET /v2/option/contract.",
    "underlyingInstrumentKey: string, expiryDate?: string",
    "UpstoxOptionContractsResponse",
    upstoxApiSchemas.getOptionContracts.input,
    upstoxApiSchemas.getOptionContracts.output,
    getOptionContracts,
  ),
  getBrokerageCharges: defineUpstoxApi(
    "getBrokerageCharges",
    "getBrokerageCharges",
    "Read-only brokerage/charges estimate for a hypothetical order. GET /v2/charges/brokerage.",
    "params: GetBrokerageParams { instrumentToken, quantity, product, transactionType, price }",
    "UpstoxBrokerageResponse",
    upstoxApiSchemas.getBrokerageCharges.input,
    upstoxApiSchemas.getBrokerageCharges.output,
    getBrokerageCharges,
  ),
  getIpos: defineUpstoxApi(
    "getIpos",
    "getIpos",
    "Paginated IPO listing filtered by status and issue type. GET /v2/ipos.",
    "params?: GetIposParams { status?, issueType?, pageNumber?, records? }",
    "UpstoxIposListResponse",
    upstoxApiSchemas.getIpos.input,
    upstoxApiSchemas.getIpos.output,
    getIpos,
  ),
  getIpoDetails: defineUpstoxApi(
    "getIpoDetails",
    "getIpoDetails",
    "Detailed information for one IPO by id. GET /v2/ipos/{id}.",
    "ipoId: string",
    "UpstoxIpoDetailsResponse",
    upstoxApiSchemas.getIpoDetails.input,
    upstoxApiSchemas.getIpoDetails.output,
    getIpoDetails,
  ),
  getInstrumentNews: defineUpstoxApi(
    "getInstrumentNews",
    "getInstrumentNews",
    "News articles tagged to instrument keys (not user holdings). GET /v2/news?category=instrument_keys.",
    "params: InstrumentNewsParams { instrumentKeys, pageNumber?, pageSize? }",
    "UpstoxNewsResponse",
    upstoxApiSchemas.getInstrumentNews.input,
    upstoxApiSchemas.getInstrumentNews.output,
    getInstrumentNews,
  ),
  authorizeMarketDataFeed: defineUpstoxApi(
    "authorizeMarketDataFeed",
    "authorizeMarketDataFeed",
    "Obtain one-time authorized WebSocket URL for Market Data Feed V3. GET /v3/feed/market-data-feed/authorize.",
    "(none)",
    "string (authorized WSS redirect URI)",
    upstoxApiSchemas.authorizeMarketDataFeed.input,
    upstoxApiSchemas.authorizeMarketDataFeed.output,
    authorizeMarketDataFeed,
  ),
  createMarketDataStreamer: defineUpstoxApi(
    "createMarketDataStreamer",
    "createMarketDataStreamer",
    "Factory for UpstoxMarketDataFeedClient (subscribe/unsubscribe LTPC or full feed over WSS).",
    "instrumentKeys?: string[], mode?: UpstoxMarketFeedMode (default ltpc)",
    "UpstoxMarketDataFeedClient",
    upstoxApiSchemas.createMarketDataStreamer.input,
    upstoxApiSchemas.createMarketDataStreamer.output,
    createMarketDataStreamer,
  ),
  testUpstoxConnection: defineUpstoxApi(
    "testUpstoxConnection",
    "testUpstoxConnection",
    "Sanity-check UPSTOX_ANALYTICS_TOKEN via exchange status; no trading data.",
    "exchange?: string (default NSE)",
    "UpstoxConnectionTestResult",
    upstoxApiSchemas.testUpstoxConnection.input,
    upstoxApiSchemas.testUpstoxConnection.output,
    testUpstoxConnection,
  ),
  assertMarginApiNotUsed: defineUpstoxApi(
    "assertMarginApiNotUsed",
    "assertMarginApiNotUsed",
    "Documents that POST /v2/charges/margin is unavailable with read-only Analytics Token; always throws UpstoxApiError.",
    "(none — calling throws)",
    "never",
    upstoxApiSchemas.assertMarginApiNotUsed.input,
    upstoxApiSchemas.assertMarginApiNotUsed.output,
    assertMarginApiNotUsed,
  ),
} as const satisfies Record<
  string,
  UpstoxApiDefinition<unknown, unknown, (...args: never[]) => unknown>
>;

export type UpstoxApiKey = keyof typeof upstoxApis;

export {
  upstoxApiSchemas,
  instrumentKeySchema,
  isinSchema,
  dateYmdSchema,
  type UpstoxApiSchemaKey,
} from "@/services/upstox/apiSchemas";

/** Flat re-exports for direct imports from `@/services/upstox`. */
export {
  getBrokerageCharges,
  type GetBrokerageParams,
} from "@/services/upstox/charges";
export {
  getBalanceSheet,
  getCashFlow,
  getCompanyProfile,
  getCompetitors,
  getCorporateActions,
  getIncomeStatement,
  getKeyRatios,
  getShareHoldings,
  type FundamentalQueryOptions,
} from "@/services/upstox/fundamentals";
export {
  getHistoricalCandles,
  getIntradayCandles,
  type HistoricalCandlesParams,
  type IntradayCandlesParams,
} from "@/services/upstox/historicalData";
export {
  getIpoDetails,
  getIpos,
  type GetIposParams,
} from "@/services/upstox/ipo";
export {
  assertMarginApiNotUsed,
  MARGIN_API_NOT_SUPPORTED_WITH_ANALYTICS_TOKEN,
} from "@/services/upstox/margins";
export {
  authorizeMarketDataFeed,
  createMarketDataStreamer,
  UpstoxMarketDataFeedClient,
  type MarketDataFeedEvent,
  type UpstoxMarketDataFeedClientOptions,
} from "@/services/upstox/marketDataWebsocket";
export {
  getChangeInOpenInterest,
  getDiiData,
  getExchangeStatus,
  getFiiData,
  getMarketHolidays,
  getMarketTimings,
  getMaxPain,
  getOpenInterest,
  getPutCallRatio,
  type BucketedAnalyticsQuery,
  type ChangeInOpenInterestQuery,
  type DerivativesAnalyticsQuery,
  type FiiDataType,
  type FiiDiiInterval,
  type FiiDiiQueryOptions,
} from "@/services/upstox/marketInformation";
export {
  getFullMarketQuotes,
  getLtpQuotes,
  getOhlcQuotes,
  getOptionGreeks,
} from "@/services/upstox/marketQuote";
export {
  getInstrumentNews,
  type InstrumentNewsParams,
} from "@/services/upstox/news";
export {
  getOptionChain,
  getOptionContracts,
  type OptionChainQuery,
} from "@/services/upstox/optionChain";
export {
  testUpstoxConnection,
  type UpstoxConnectionTestResult,
} from "@/services/upstox/testConnection";
export type { OhlcQuoteInterval } from "@/services/upstox/validation";
export type * from "@/services/upstox/types";
