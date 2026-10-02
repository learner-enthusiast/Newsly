import { getUpstoxClient } from "@/clients/upstoxClient";
import type { UpstoxNewsResponse } from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertInstrumentKeys,
  assertPagination,
  joinInstrumentKeys,
} from "@/services/upstox/validation";

const MAX_NEWS_INSTRUMENT_KEYS = 30;

export type InstrumentNewsParams = {
  instrumentKeys: string[];
  pageNumber?: number;
  pageSize?: number;
};

async function getInstrumentNewsHttp(
  params: InstrumentNewsParams,
  joinedKeys: string,
): Promise<UpstoxNewsResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxNewsResponse>("/v2/news", {
    query: {
      category: "instrument_keys",
      instrument_keys: joinedKeys,
      ...(params.pageNumber != null
        ? { page_number: params.pageNumber }
        : {}),
      ...(params.pageSize != null ? { page_size: params.pageSize } : {}),
    },
  });
}

/**
 * Instrument-based news only (`category=instrument_keys`).
 * Does not call positions/holdings categories (user-specific).
 *
 * `GET /v2/news`
 * @see https://upstox.com/developer/api-documentation/get-news/
 */
export async function getInstrumentNews(
  params: InstrumentNewsParams,
): Promise<UpstoxNewsResponse> {
  const keys = assertInstrumentKeys(params.instrumentKeys, {
    max: MAX_NEWS_INSTRUMENT_KEYS,
    fieldName: "instrument_keys",
  });
  assertPagination(params.pageNumber, params.pageSize, {
    pageMin: 1,
    pageMax: 100,
    sizeMin: 1,
    sizeMax: 100,
  });

  const joined = joinInstrumentKeys(keys);

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.news.getInstrumentNews(
        joined,
        params.pageNumber,
        params.pageSize,
      ),
    http: () => getInstrumentNewsHttp(params, joined),
  });
}
