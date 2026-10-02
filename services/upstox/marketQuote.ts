import { getUpstoxClient } from "@/clients/upstoxClient";
import type {
  UpstoxFullMarketQuoteResponse,
  UpstoxLtpQuoteResponse,
  UpstoxOhlcQuoteResponse,
  UpstoxOptionGreekQuoteResponse,
} from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertInstrumentKeys,
  assertOhlcInterval,
  joinInstrumentKeys,
  type OhlcQuoteInterval,
} from "@/services/upstox/validation";

const MAX_FULL_QUOTES = 500;
const MAX_OPTION_GREEKS = 50;

async function getFullMarketQuotesHttp(
  instrumentKeys: string[],
): Promise<UpstoxFullMarketQuoteResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxFullMarketQuoteResponse>("/v3/market-quote/quotes", {
    query: { instrument_key: joinInstrumentKeys(instrumentKeys) },
  });
}

/**
 * `GET /v3/market-quote/quotes`
 * @see https://upstox.com/developer/api-documentation/get-full-market-quote-v3/
 */
export async function getFullMarketQuotes(
  instrumentKeys: string[],
): Promise<UpstoxFullMarketQuoteResponse> {
  const keys = assertInstrumentKeys(instrumentKeys, { max: MAX_FULL_QUOTES });
  const joined = joinInstrumentKeys(keys);
  return withUpstoxTransport({
    sdk: () => upstoxSdk.marketQuote.getFullMarketQuotes(joined),
    http: () => getFullMarketQuotesHttp(keys),
  });
}

async function getOhlcQuotesHttp(
  instrumentKeys: string[],
  interval: OhlcQuoteInterval,
): Promise<UpstoxOhlcQuoteResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxOhlcQuoteResponse>("/v3/market-quote/ohlc", {
    query: {
      instrument_key: joinInstrumentKeys(instrumentKeys),
      interval,
    },
  });
}

/**
 * `GET /v3/market-quote/ohlc`
 * @see https://upstox.com/developer/api-documentation/get-market-quote-ohlc-v3/
 */
export async function getOhlcQuotes(
  instrumentKeys: string[],
  interval: OhlcQuoteInterval | string,
): Promise<UpstoxOhlcQuoteResponse> {
  const keys = assertInstrumentKeys(instrumentKeys, { max: MAX_FULL_QUOTES });
  const validatedInterval = assertOhlcInterval(interval);
  const joined = joinInstrumentKeys(keys);
  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.marketQuote.getOhlcQuotes(joined, validatedInterval),
    http: () => getOhlcQuotesHttp(keys, validatedInterval),
  });
}

async function getLtpQuotesHttp(
  instrumentKeys: string[],
): Promise<UpstoxLtpQuoteResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxLtpQuoteResponse>("/v3/market-quote/ltp", {
    query: { instrument_key: joinInstrumentKeys(instrumentKeys) },
  });
}

/**
 * `GET /v3/market-quote/ltp`
 * @see https://upstox.com/developer/api-documentation/ltp-v3/
 */
export async function getLtpQuotes(
  instrumentKeys: string[],
): Promise<UpstoxLtpQuoteResponse> {
  const keys = assertInstrumentKeys(instrumentKeys, { max: MAX_FULL_QUOTES });
  const joined = joinInstrumentKeys(keys);
  return withUpstoxTransport({
    sdk: () => upstoxSdk.marketQuote.getLtpQuotes(joined),
    http: () => getLtpQuotesHttp(keys),
  });
}

async function getOptionGreeksHttp(
  instrumentKeys: string[],
): Promise<UpstoxOptionGreekQuoteResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxOptionGreekQuoteResponse>(
    "/v3/market-quote/option-greek",
    {
      query: { instrument_key: joinInstrumentKeys(instrumentKeys) },
    },
  );
}

/**
 * `GET /v3/market-quote/option-greek`
 * @see https://upstox.com/developer/api-documentation/option-greek/
 */
export async function getOptionGreeks(
  instrumentKeys: string[],
): Promise<UpstoxOptionGreekQuoteResponse> {
  const keys = assertInstrumentKeys(instrumentKeys, {
    max: MAX_OPTION_GREEKS,
  });
  const joined = joinInstrumentKeys(keys);
  return withUpstoxTransport({
    sdk: () => upstoxSdk.marketQuote.getOptionGreeks(joined),
    http: () => getOptionGreeksHttp(keys),
  });
}
