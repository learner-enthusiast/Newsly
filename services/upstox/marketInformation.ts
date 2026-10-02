import { getUpstoxClient } from "@/clients/upstoxClient";
import type {
  UpstoxChangeOiResponse,
  UpstoxExchangeStatusResponse,
  UpstoxFiiDiiResponse,
  UpstoxMarketHolidaysResponse,
  UpstoxMarketTimingsResponse,
  UpstoxMaxPainResponse,
  UpstoxOpenInterestResponse,
  UpstoxPcrResponse,
} from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertDateYyyyMmDd,
  assertInstrumentKey,
  upstoxInputError,
} from "@/services/upstox/validation";

export type FiiDataType =
  | "NSE_FO|INDEX_FUTURES"
  | "NSE_FO|STOCK_FUTURES"
  | "NSE_FO|INDEX_OPTIONS"
  | "NSE_FO|STOCK_OPTIONS"
  | "NSE_EQ|CASH";

export type FiiDiiInterval = "1D" | "1M";

export type FiiDiiQueryOptions = {
  interval: FiiDiiInterval;
  dataTypes?: FiiDataType[];
  from?: string;
};

export async function getFiiData(
  options: FiiDiiQueryOptions,
): Promise<UpstoxFiiDiiResponse> {
  const dataTypes = options.dataTypes ?? ["NSE_EQ|CASH"];
  if (options.from) {
    assertDateYyyyMmDd(options.from, "from");
  }
  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.marketInformation.getFiiData(
        dataTypes,
        options.interval,
        options.from,
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxFiiDiiResponse>("/v2/market/fii", {
        query: {
          data_type: dataTypes,
          interval: options.interval,
          ...(options.from ? { from: options.from } : {}),
        },
      });
    },
  });
}

export async function getDiiData(
  options: Pick<FiiDiiQueryOptions, "interval" | "from">,
): Promise<UpstoxFiiDiiResponse> {
  if (options.from) {
    assertDateYyyyMmDd(options.from, "from");
  }
  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.marketInformation.getDiiData(options.interval, options.from),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxFiiDiiResponse>("/v2/market/dii", {
        query: {
          data_type: "NSE_EQ|CASH",
          interval: options.interval,
          ...(options.from ? { from: options.from } : {}),
        },
      });
    },
  });
}

export type DerivativesAnalyticsQuery = {
  instrumentKey: string;
  expiry: string;
  date: string;
};

export async function getOpenInterest(
  query: DerivativesAnalyticsQuery,
): Promise<UpstoxOpenInterestResponse> {
  assertInstrumentKey(query.instrumentKey);
  assertDateYyyyMmDd(query.expiry, "expiry");
  assertDateYyyyMmDd(query.date, "date");

  const instrumentKey = query.instrumentKey.trim();
  const expiry = query.expiry.trim();
  const date = query.date.trim();

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.marketInformation.getOpenInterest(
        instrumentKey,
        expiry,
        date,
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxOpenInterestResponse>("/v2/market/oi", {
        query: {
          instrument_key: instrumentKey,
          expiry,
          date,
        },
      });
    },
  });
}

export type ChangeInOpenInterestQuery = DerivativesAnalyticsQuery & {
  intervalDays: number;
};

export async function getChangeInOpenInterest(
  query: ChangeInOpenInterestQuery,
): Promise<UpstoxChangeOiResponse> {
  assertInstrumentKey(query.instrumentKey);
  assertDateYyyyMmDd(query.expiry, "expiry");
  assertDateYyyyMmDd(query.date, "date");
  if (
    !Number.isFinite(query.intervalDays) ||
    !Number.isInteger(query.intervalDays) ||
    query.intervalDays <= 0
  ) {
    throw upstoxInputError("interval must be a positive integer (days).");
  }

  const instrumentKey = query.instrumentKey.trim();
  const expiry = query.expiry.trim();
  const date = query.date.trim();

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.marketInformation.getChangeInOpenInterest(
        instrumentKey,
        expiry,
        date,
        query.intervalDays,
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxChangeOiResponse>("/v2/market/change-oi", {
        query: {
          instrument_key: instrumentKey,
          expiry,
          date,
          interval: query.intervalDays,
        },
      });
    },
  });
}

export type BucketedAnalyticsQuery = DerivativesAnalyticsQuery & {
  bucketIntervalMinutes: number;
};

export async function getMaxPain(
  query: BucketedAnalyticsQuery,
): Promise<UpstoxMaxPainResponse> {
  assertInstrumentKey(query.instrumentKey);
  assertDateYyyyMmDd(query.expiry, "expiry");
  assertDateYyyyMmDd(query.date, "date");
  if (
    !Number.isFinite(query.bucketIntervalMinutes) ||
    query.bucketIntervalMinutes <= 0
  ) {
    throw upstoxInputError("bucket_interval must be a positive number.");
  }

  const instrumentKey = query.instrumentKey.trim();
  const expiry = query.expiry.trim();
  const date = query.date.trim();

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.marketInformation.getMaxPain(
        instrumentKey,
        expiry,
        date,
        query.bucketIntervalMinutes,
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxMaxPainResponse>("/v2/market/max-pain", {
        query: {
          instrument_key: instrumentKey,
          expiry,
          date,
          bucket_interval: query.bucketIntervalMinutes,
        },
      });
    },
  });
}

export async function getPutCallRatio(
  query: BucketedAnalyticsQuery,
): Promise<UpstoxPcrResponse> {
  assertInstrumentKey(query.instrumentKey);
  assertDateYyyyMmDd(query.expiry, "expiry");
  assertDateYyyyMmDd(query.date, "date");
  if (
    !Number.isFinite(query.bucketIntervalMinutes) ||
    query.bucketIntervalMinutes <= 0
  ) {
    throw upstoxInputError("bucket_interval must be a positive number.");
  }

  const instrumentKey = query.instrumentKey.trim();
  const expiry = query.expiry.trim();
  const date = query.date.trim();

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.marketInformation.getPutCallRatio(
        instrumentKey,
        expiry,
        date,
        query.bucketIntervalMinutes,
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxPcrResponse>("/v2/market/pcr", {
        query: {
          instrument_key: instrumentKey,
          expiry,
          date,
          bucket_interval: query.bucketIntervalMinutes,
        },
      });
    },
  });
}

export async function getMarketHolidays(
  date?: string,
): Promise<UpstoxMarketHolidaysResponse> {
  if (date) {
    assertDateYyyyMmDd(date, "date");
  }
  const trimmedDate = date?.trim();
  return withUpstoxTransport({
    sdk: () =>
      trimmedDate
        ? upstoxSdk.marketInformation.getHoliday(trimmedDate)
        : upstoxSdk.marketInformation.getHolidays(),
    http: () => {
      const client = getUpstoxClient();
      const path = trimmedDate
        ? `/v2/market/holidays/${encodeURIComponent(trimmedDate)}`
        : "/v2/market/holidays";
      return client.get<UpstoxMarketHolidaysResponse>(path);
    },
  });
}

export async function getMarketTimings(
  date: string,
): Promise<UpstoxMarketTimingsResponse> {
  assertDateYyyyMmDd(date, "date");
  const trimmed = date.trim();
  return withUpstoxTransport({
    sdk: () => upstoxSdk.marketInformation.getExchangeTimings(trimmed),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxMarketTimingsResponse>(
        `/v2/market/timings/${encodeURIComponent(trimmed)}`,
      );
    },
  });
}

export async function getExchangeStatus(
  exchange: string,
): Promise<UpstoxExchangeStatusResponse> {
  assertNonEmptyExchange(exchange);
  const trimmed = exchange.trim();
  return withUpstoxTransport({
    sdk: () => upstoxSdk.marketInformation.getMarketStatus(trimmed),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxExchangeStatusResponse>(
        `/v2/market/status/${encodeURIComponent(trimmed)}`,
        { noRetry: true },
      );
    },
  });
}

function assertNonEmptyExchange(exchange: string): void {
  if (typeof exchange !== "string" || exchange.trim().length === 0) {
    throw upstoxInputError("exchange is required.");
  }
}

/** @deprecated Use getExchangeStatus */
export const getMarketExchangeStatus = async (exchange: string) => {
  const response = await getExchangeStatus(exchange);
  return {
    exchange: response.data?.exchange ?? exchange,
    status: response.data?.status ?? "unknown",
    lastUpdatedMs: response.data?.last_updated ?? null,
  };
};
