import { getUpstoxClient } from "@/clients/upstoxClient";
import type { UpstoxHistoricalCandlesResponse } from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertDateYyyyMmDd,
  assertHistoricalInterval,
  assertHistoricalUnit,
  assertInstrumentKey,
  type HistoricalCandleUnit,
  upstoxInputError,
} from "@/services/upstox/validation";

export type HistoricalCandlesParams = {
  instrumentKey: string;
  unit: HistoricalCandleUnit | string;
  interval: string;
  toDate: string;
  fromDate?: string;
};

export type IntradayCandlesParams = {
  instrumentKey: string;
  unit: Extract<HistoricalCandleUnit, "minutes" | "hours"> | string;
  interval: string;
};

function encodeInstrumentKey(instrumentKey: string): string {
  return encodeURIComponent(instrumentKey.trim());
}

async function getHistoricalCandlesHttp(
  params: HistoricalCandlesParams,
  unit: HistoricalCandleUnit,
): Promise<UpstoxHistoricalCandlesResponse> {
  const encoded = encodeInstrumentKey(params.instrumentKey);
  const path = params.fromDate
    ? `/v3/historical-candle/${encoded}/${unit}/${params.interval}/${params.toDate}/${params.fromDate}`
    : `/v3/historical-candle/${encoded}/${unit}/${params.interval}/${params.toDate}`;
  const client = getUpstoxClient();
  return client.get<UpstoxHistoricalCandlesResponse>(path);
}

async function getIntradayCandlesHttp(
  params: IntradayCandlesParams,
  unit: HistoricalCandleUnit,
): Promise<UpstoxHistoricalCandlesResponse> {
  const encoded = encodeInstrumentKey(params.instrumentKey);
  const path = `/v3/historical-candle/intraday/${encoded}/${unit}/${params.interval}`;
  const client = getUpstoxClient();
  return client.get<UpstoxHistoricalCandlesResponse>(path);
}

/**
 * `GET /v3/historical-candle/{instrument_key}/{unit}/{interval}/{to_date}[/{from_date}]`
 * @see https://upstox.com/developer/api-documentation/v3/get-historical-candle-data/
 */
export async function getHistoricalCandles(
  params: HistoricalCandlesParams,
): Promise<UpstoxHistoricalCandlesResponse> {
  assertInstrumentKey(params.instrumentKey);
  const unit = assertHistoricalUnit(params.unit);
  assertHistoricalInterval(unit, params.interval);
  assertDateYyyyMmDd(params.toDate, "to_date");
  if (params.fromDate) {
    assertDateYyyyMmDd(params.fromDate, "from_date");
  }

  const interval = Number(params.interval);
  const key = params.instrumentKey.trim();

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.history.getHistoricalCandles(
        key,
        unit,
        interval,
        params.toDate,
        params.fromDate,
      ),
    http: () => getHistoricalCandlesHttp(params, unit),
  });
}

/**
 * `GET /v3/historical-candle/intraday/{instrument_key}/{unit}/{interval}`
 * @see https://upstox.com/developer/api-documentation/v3/get-intra-day-candle-data/
 */
export async function getIntradayCandles(
  params: IntradayCandlesParams,
): Promise<UpstoxHistoricalCandlesResponse> {
  assertInstrumentKey(params.instrumentKey);
  const unit = assertHistoricalUnit(params.unit);
  if (unit !== "minutes" && unit !== "hours") {
    throw upstoxInputError(
      "Intraday candles support unit minutes or hours only.",
    );
  }
  assertHistoricalInterval(unit, params.interval);

  const interval = Number(params.interval);
  const key = params.instrumentKey.trim();

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.history.getIntradayCandles(key, unit, interval),
    http: () => getIntradayCandlesHttp(params, unit),
  });
}

/** @deprecated Use getHistoricalCandles */
export const getHistoricalData = getHistoricalCandles;

/** @deprecated Use getIntradayCandles */
export const getIntradayHistoricalData = getIntradayCandles;
