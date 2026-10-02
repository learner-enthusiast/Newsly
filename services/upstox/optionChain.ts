import { getUpstoxClient } from "@/clients/upstoxClient";
import type {
  UpstoxOptionChainResponse,
  UpstoxOptionContractsResponse,
} from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertDateYyyyMmDd,
  assertInstrumentKey,
} from "@/services/upstox/validation";

export type OptionChainQuery = {
  instrumentKey: string;
  expiryDate: string;
};

async function getOptionChainHttp(
  query: OptionChainQuery,
): Promise<UpstoxOptionChainResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxOptionChainResponse>("/v2/option/chain", {
    query: {
      instrument_key: query.instrumentKey.trim(),
      expiry_date: query.expiryDate.trim(),
    },
  });
}

/**
 * `GET /v2/option/chain`
 * @see https://upstox.com/developer/api-documentation/get-pc-option-chain/
 */
export async function getOptionChain(
  query: OptionChainQuery,
): Promise<UpstoxOptionChainResponse> {
  assertInstrumentKey(query.instrumentKey);
  assertDateYyyyMmDd(query.expiryDate, "expiry_date");

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.options.getOptionChain(
        query.instrumentKey.trim(),
        query.expiryDate.trim(),
      ),
    http: () => getOptionChainHttp(query),
  });
}

async function getOptionContractsHttp(
  underlyingInstrumentKey: string,
  expiryDate?: string,
): Promise<UpstoxOptionContractsResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxOptionContractsResponse>("/v2/option/contract", {
    query: {
      instrument_key: underlyingInstrumentKey.trim(),
      ...(expiryDate ? { expiry_date: expiryDate.trim() } : {}),
    },
  });
}

/**
 * `GET /v2/option/contract`
 * @see https://upstox.com/developer/api-documentation/get-option-contracts/
 */
export async function getOptionContracts(
  underlyingInstrumentKey: string,
  expiryDate?: string,
): Promise<UpstoxOptionContractsResponse> {
  assertInstrumentKey(underlyingInstrumentKey);
  if (expiryDate) {
    assertDateYyyyMmDd(expiryDate, "expiry_date");
  }

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.options.getOptionContracts(
        underlyingInstrumentKey.trim(),
        expiryDate?.trim(),
      ),
    http: () => getOptionContractsHttp(underlyingInstrumentKey, expiryDate),
  });
}
