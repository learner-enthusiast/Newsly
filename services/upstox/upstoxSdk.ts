/**
 * Server-only wrapper around the official `upstox-js-sdk`.
 * Configures UPSTOX_ANALYTICS_TOKEN as the SDK OAuth2 bearer token (not user OAuth).
 */
import { createRequire } from "node:module";
import {
  UpstoxApiError,
  type UpstoxErrorKind,
} from "@/clients/upstoxClient";
import type * as UpstoxSdkTypes from "upstox-js-sdk";
import type {
  UpstoxBrokerageResponse,
  UpstoxChangeOiResponse,
  UpstoxCompanyProfileResponse,
  UpstoxCompetitorsResponse,
  UpstoxExchangeStatusResponse,
  UpstoxFiiDiiResponse,
  UpstoxFullMarketQuoteResponse,
  UpstoxHistoricalCandlesResponse,
  UpstoxIpoDetailsResponse,
  UpstoxIposListResponse,
  UpstoxKeyRatiosResponse,
  UpstoxLtpQuoteResponse,
  UpstoxMarketFeedAuthorizeResponse,
  UpstoxMarketHolidaysResponse,
  UpstoxMarketTimingsResponse,
  UpstoxMaxPainResponse,
  UpstoxNewsResponse,
  UpstoxOhlcQuoteResponse,
  UpstoxOpenInterestResponse,
  UpstoxOptionChainResponse,
  UpstoxOptionContractsResponse,
  UpstoxOptionGreekQuoteResponse,
  UpstoxPcrResponse,
  UpstoxShareHoldingsResponse,
  UpstoxSuccessEnvelope,
} from "@/services/upstox/types";

const require = createRequire(import.meta.url);
export const UPSTOX_SDK_VERSION: string = (
  require("upstox-js-sdk/package.json") as { version: string }
).version;

const UpstoxClient = require("upstox-js-sdk") as typeof UpstoxSdkTypes & {
  ApiClient: typeof UpstoxSdkTypes.ApiClient;
  MarketQuoteV3Api: typeof UpstoxSdkTypes.MarketQuoteV3Api;
  HistoryV3Api: typeof UpstoxSdkTypes.HistoryV3Api;
  OptionsApi: typeof UpstoxSdkTypes.OptionsApi;
  MarketApi: typeof UpstoxSdkTypes.MarketApi;
  FundamentalsApi: typeof UpstoxSdkTypes.FundamentalsApi;
  NewsApi: typeof UpstoxSdkTypes.NewsApi;
  IPOApi: typeof UpstoxSdkTypes.IPOApi;
  ChargeApi: typeof UpstoxSdkTypes.ChargeApi;
  MarketHolidaysAndTimingsApi: typeof UpstoxSdkTypes.MarketHolidaysAndTimingsApi;
  WebsocketApi: typeof UpstoxSdkTypes.WebsocketApi;
  MarketDataStreamerV3: typeof UpstoxSdkTypes.MarketDataStreamerV3;
};

const { ApiClient } = UpstoxClient;

const BROKERAGE_API_VERSION = "2.0";

type SdkError = {
  status?: number;
  response?: { body?: UpstoxErrorBody; text?: string };
  message?: string;
};

type UpstoxErrorBody = {
  status?: string;
  errors?: Array<{ errorCode?: string; message?: string }>;
  message?: string;
};

let forceHttpFallback = false;

/** @internal Tests — route all services through HTTP fallback transport. */
export function __forceUpstoxHttpFallbackForTests(enable: boolean): void {
  forceHttpFallback = enable;
}

export function isUpstoxHttpFallbackForced(): boolean {
  return forceHttpFallback;
}

export function configureUpstoxSdkToken(explicitToken?: string): void {
  const token = (explicitToken ?? process.env.UPSTOX_ANALYTICS_TOKEN)?.trim();
  if (!token) {
    throw new UpstoxApiError("UPSTOX_ANALYTICS_TOKEN is not configured.", {
      kind: "missing_token",
      status: 0,
    });
  }
  ApiClient.instance.authentications.OAUTH2.accessToken = token;
}

function classifySdkError(status: number): UpstoxErrorKind {
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status === 400 || status === 422) {
    return "invalid_request";
  }
  if (status >= 500) {
    return "server";
  }
  return "invalid_request";
}

function messageFromSdkBody(body: UpstoxErrorBody | undefined, fallback: string): string {
  const first = body?.errors?.[0];
  if (first?.message) {
    return first.errorCode ? `${first.errorCode}: ${first.message}` : first.message;
  }
  if (body?.message) {
    return body.message;
  }
  return fallback;
}

export function mapSdkError(error: SdkError): UpstoxApiError {
  const status = error.status ?? 0;
  const body = error.response?.body;
  return new UpstoxApiError(
    messageFromSdkBody(body, error.message ?? "Upstox SDK request failed."),
    {
      kind: classifySdkError(status),
      status,
      errorCode: body?.errors?.[0]?.errorCode,
    },
  );
}

export function sdkModelToPlain<T>(model: unknown): T {
  if (model == null) {
    return model as T;
  }
  return JSON.parse(JSON.stringify(model)) as T;
}

function promisifySdk<T>(
  invoke: (callback: (error: unknown, data: unknown) => void) => void,
): Promise<T> {
  configureUpstoxSdkToken();
  return new Promise((resolve, reject) => {
    invoke((error, data) => {
      if (error) {
        reject(mapSdkError(error as SdkError));
        return;
      }
      if (data == null) {
        reject(
          new UpstoxApiError("Upstox SDK returned empty response.", {
            kind: "malformed",
            status: 0,
          }),
        );
        return;
      }
      resolve(sdkModelToPlain<T>(data));
    });
  });
}

function marketQuoteV3Api() {
  return new UpstoxClient.MarketQuoteV3Api(ApiClient.instance);
}

function historyV3Api() {
  return new UpstoxClient.HistoryV3Api(ApiClient.instance);
}

function optionsApi() {
  return new UpstoxClient.OptionsApi(ApiClient.instance);
}

function marketApi() {
  return new UpstoxClient.MarketApi(ApiClient.instance);
}

function fundamentalsApi() {
  return new UpstoxClient.FundamentalsApi(ApiClient.instance);
}

function newsApi() {
  return new UpstoxClient.NewsApi(ApiClient.instance);
}

function ipoApi() {
  return new UpstoxClient.IPOApi(ApiClient.instance);
}

function chargeApi() {
  return new UpstoxClient.ChargeApi(ApiClient.instance);
}

function marketHolidaysApi() {
  return new UpstoxClient.MarketHolidaysAndTimingsApi(ApiClient.instance);
}

function websocketApi() {
  return new UpstoxClient.WebsocketApi(ApiClient.instance);
}

/** SDK-first transport; HTTP runs only when forced (tests) or explicitly requested. */
export async function withUpstoxTransport<T>(options: {
  sdk: () => Promise<T>;
  http?: () => Promise<T>;
  /** Use HTTP when the installed SDK omits required parameters (per-endpoint). */
  preferHttp?: boolean;
}): Promise<T> {
  if (options.preferHttp && options.http) {
    return options.http();
  }
  if (
    (forceHttpFallback ||
      process.env.UPSTOX_USE_HTTP_FALLBACK?.trim() === "true") &&
    options.http
  ) {
    return options.http();
  }
  return options.sdk();
}

export const upstoxSdk = {
  marketQuote: {
    getFullMarketQuotes(instrumentKey: string): Promise<UpstoxFullMarketQuoteResponse> {
      return promisifySdk<UpstoxFullMarketQuoteResponse>((cb) =>
        marketQuoteV3Api().getFullMarketQuoteV3({ instrumentKey }, cb),
      );
    },
    getOhlcQuotes(
      instrumentKey: string,
      interval: string,
    ): Promise<UpstoxOhlcQuoteResponse> {
      return promisifySdk<UpstoxOhlcQuoteResponse>((cb) =>
        marketQuoteV3Api().getMarketQuoteOHLC(interval, { instrumentKey }, cb),
      );
    },
    getLtpQuotes(instrumentKey: string): Promise<UpstoxLtpQuoteResponse> {
      return promisifySdk<UpstoxLtpQuoteResponse>((cb) =>
        marketQuoteV3Api().getLtp({ instrumentKey }, cb),
      );
    },
    getOptionGreeks(instrumentKey: string): Promise<UpstoxOptionGreekQuoteResponse> {
      return promisifySdk<UpstoxOptionGreekQuoteResponse>((cb) =>
        marketQuoteV3Api().getMarketQuoteOptionGreek({ instrumentKey }, cb),
      );
    },
  },
  history: {
    getHistoricalCandles(
      instrumentKey: string,
      unit: string,
      interval: number,
      toDate: string,
      fromDate?: string,
    ): Promise<UpstoxHistoricalCandlesResponse> {
      if (fromDate) {
        return promisifySdk<UpstoxHistoricalCandlesResponse>((cb) =>
          historyV3Api().getHistoricalCandleData1(
            instrumentKey,
            unit,
            interval,
            toDate,
            fromDate,
            cb,
          ),
        );
      }
      return promisifySdk<UpstoxHistoricalCandlesResponse>((cb) =>
        historyV3Api().getHistoricalCandleData(
          instrumentKey,
          unit,
          interval,
          toDate,
          cb,
        ),
      );
    },
    getIntradayCandles(
      instrumentKey: string,
      unit: string,
      interval: number,
    ): Promise<UpstoxHistoricalCandlesResponse> {
      return promisifySdk<UpstoxHistoricalCandlesResponse>((cb) =>
        historyV3Api().getIntraDayCandleData(
          instrumentKey,
          unit,
          interval,
          cb,
        ),
      );
    },
  },
  options: {
    getOptionChain(
      instrumentKey: string,
      expiryDate: string,
    ): Promise<UpstoxOptionChainResponse> {
      return promisifySdk<UpstoxOptionChainResponse>((cb) =>
        optionsApi().getPutCallOptionChain(instrumentKey, expiryDate, cb),
      );
    },
    getOptionContracts(
      instrumentKey: string,
      expiryDate?: string,
    ): Promise<UpstoxOptionContractsResponse> {
      return promisifySdk<UpstoxOptionContractsResponse>((cb) =>
        optionsApi().getOptionContracts(
          instrumentKey,
          expiryDate ? { expiryDate } : {},
          cb,
        ),
      );
    },
  },
  marketInformation: {
    getFiiData(
      dataType: string | string[],
      interval: string,
      from?: string,
    ): Promise<UpstoxFiiDiiResponse> {
      return promisifySdk<UpstoxFiiDiiResponse>((cb) =>
        marketApi().getFiiData(dataType, interval, from ? { from } : {}, cb),
      );
    },
    getDiiData(interval: string, from?: string): Promise<UpstoxFiiDiiResponse> {
      return promisifySdk<UpstoxFiiDiiResponse>((cb) =>
        marketApi().getDiiData("NSE_EQ|CASH", interval, from ? { from } : {}, cb),
      );
    },
    getOpenInterest(
      instrumentKey: string,
      expiry: string,
      date: string,
    ): Promise<UpstoxOpenInterestResponse> {
      return promisifySdk<UpstoxOpenInterestResponse>((cb) =>
        marketApi().getOiData(instrumentKey, expiry, date, cb),
      );
    },
    getChangeInOpenInterest(
      instrumentKey: string,
      expiry: string,
      date: string,
      intervalDays: number,
    ): Promise<UpstoxChangeOiResponse> {
      return promisifySdk<UpstoxChangeOiResponse>((cb) =>
        marketApi().getChangeOiData(
          instrumentKey,
          expiry,
          date,
          intervalDays,
          cb,
        ),
      );
    },
    getMaxPain(
      instrumentKey: string,
      expiry: string,
      date: string,
      bucketIntervalMinutes: number,
    ): Promise<UpstoxMaxPainResponse> {
      return promisifySdk<UpstoxMaxPainResponse>((cb) =>
        marketApi().getMaxPainData(
          instrumentKey,
          expiry,
          date,
          bucketIntervalMinutes,
          cb,
        ),
      );
    },
    getPutCallRatio(
      instrumentKey: string,
      expiry: string,
      date: string,
      bucketIntervalMinutes: number,
    ): Promise<UpstoxPcrResponse> {
      return promisifySdk<UpstoxPcrResponse>((cb) =>
        marketApi().getPcrData(
          instrumentKey,
          expiry,
          date,
          bucketIntervalMinutes,
          cb,
        ),
      );
    },
    getHolidays(): Promise<UpstoxMarketHolidaysResponse> {
      return promisifySdk<UpstoxMarketHolidaysResponse>((cb) =>
        marketHolidaysApi().getHolidays(cb),
      );
    },
    getHoliday(date: string): Promise<UpstoxMarketHolidaysResponse> {
      return promisifySdk<UpstoxMarketHolidaysResponse>((cb) =>
        marketHolidaysApi().getHoliday(date, cb),
      );
    },
    getExchangeTimings(date: string): Promise<UpstoxMarketTimingsResponse> {
      return promisifySdk<UpstoxMarketTimingsResponse>((cb) =>
        marketHolidaysApi().getExchangeTimings(date, cb),
      );
    },
    getMarketStatus(exchange: string): Promise<UpstoxExchangeStatusResponse> {
      return promisifySdk<UpstoxExchangeStatusResponse>((cb) =>
        marketHolidaysApi().getMarketStatus(exchange, cb),
      );
    },
  },
  fundamentals: {
    getCompanyProfile(isin: string): Promise<UpstoxCompanyProfileResponse> {
      return promisifySdk<UpstoxCompanyProfileResponse>((cb) =>
        fundamentalsApi().getCompanyProfile(isin, cb),
      );
    },
    getKeyRatios(isin: string): Promise<UpstoxKeyRatiosResponse> {
      return promisifySdk<UpstoxKeyRatiosResponse>((cb) =>
        fundamentalsApi().getKeyRatios(isin, cb),
      );
    },
    getShareHoldings(isin: string): Promise<UpstoxShareHoldingsResponse> {
      return promisifySdk<UpstoxShareHoldingsResponse>((cb) =>
        fundamentalsApi().getShareHoldings(isin, cb),
      );
    },
    getBalanceSheet(
      isin: string,
      opts: { type?: string; fs?: boolean },
    ): Promise<UpstoxSuccessEnvelope<unknown>> {
      return promisifySdk<UpstoxSuccessEnvelope<unknown>>((cb) =>
        fundamentalsApi().getBalanceSheet(isin, opts, cb),
      );
    },
    getIncomeStatement(
      isin: string,
      opts: { type?: string; timePeriod?: string; fs?: boolean },
    ): Promise<UpstoxSuccessEnvelope<unknown>> {
      return promisifySdk<UpstoxSuccessEnvelope<unknown>>((cb) =>
        fundamentalsApi().getIncomeStatement(isin, opts, cb),
      );
    },
    getCashFlow(
      isin: string,
      opts: { type?: string; timePeriod?: string; fs?: boolean },
    ): Promise<UpstoxSuccessEnvelope<unknown>> {
      return promisifySdk<UpstoxSuccessEnvelope<unknown>>((cb) =>
        fundamentalsApi().getCashFlow(isin, opts, cb),
      );
    },
    getCorporateActions(isin: string): Promise<UpstoxSuccessEnvelope<unknown>> {
      return promisifySdk<UpstoxSuccessEnvelope<unknown>>((cb) =>
        fundamentalsApi().getCorporateActions(isin, cb),
      );
    },
    getCompetitors(identifier: string): Promise<UpstoxCompetitorsResponse> {
      return promisifySdk<UpstoxCompetitorsResponse>((cb) =>
        fundamentalsApi().getCompetitors(identifier, cb),
      );
    },
  },
  news: {
    getInstrumentNews(
      instrumentKeys: string,
      pageNumber?: number,
      pageSize?: number,
    ): Promise<UpstoxNewsResponse> {
      return promisifySdk<UpstoxNewsResponse>((cb) =>
        newsApi().getNews(
          "instrument_keys",
          {
            instrumentKeys,
            pageNumber,
            pageSize,
          },
          cb,
        ),
      );
    },
  },
  ipo: {
    getIpoListing(opts: {
      status?: string;
      issueType?: string;
      pageNumber?: number;
      records?: number;
    }): Promise<UpstoxIposListResponse> {
      return promisifySdk<UpstoxIposListResponse>((cb) =>
        ipoApi().getIpoListing(opts, cb),
      );
    },
    getIpoDetails(ipoId: string): Promise<UpstoxIpoDetailsResponse> {
      return promisifySdk<UpstoxIpoDetailsResponse>((cb) =>
        ipoApi().getIpoDetails(ipoId, cb),
      );
    },
  },
  charges: {
    getBrokerage(
      instrumentToken: string,
      quantity: number,
      product: string,
      transactionType: string,
      price: number,
    ): Promise<UpstoxBrokerageResponse> {
      return promisifySdk<UpstoxBrokerageResponse>((cb) =>
        chargeApi().getBrokerage(
          instrumentToken,
          quantity,
          product,
          transactionType,
          price,
          BROKERAGE_API_VERSION,
          cb,
        ),
      );
    },
  },
  websocket: {
    authorizeMarketDataFeedV3(): Promise<UpstoxMarketFeedAuthorizeResponse> {
      return promisifySdk<UpstoxMarketFeedAuthorizeResponse>((cb) =>
        websocketApi().getMarketDataFeedAuthorizeV3(cb),
      );
    },
  },
};

export type UpstoxSdkMarketDataStreamer = InstanceType<
  typeof UpstoxClient.MarketDataStreamerV3
>;

export function createMarketDataStreamerV3(
  instrumentKeys: string[] = [],
  mode: string = "ltpc",
): UpstoxSdkMarketDataStreamer {
  configureUpstoxSdkToken();
  return new UpstoxClient.MarketDataStreamerV3(instrumentKeys, mode);
}

export { UpstoxClient };
