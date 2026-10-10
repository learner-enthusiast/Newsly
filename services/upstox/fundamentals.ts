import { getUpstoxClient } from "@/clients/upstoxClient";
import type {
  UpstoxCompanyProfileResponse,
  UpstoxCompetitorsResponse,
  UpstoxKeyRatiosResponse,
  UpstoxShareHoldingsResponse,
  UpstoxSuccessEnvelope,
} from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertIsin,
  assertNonEmptyString,
} from "@/services/upstox/validation";

export type FundamentalStatementType = "consolidated" | "standalone";
export type FundamentalTimePeriod = "yearly" | "quarterly";

export type FundamentalQueryOptions = {
  type?: FundamentalStatementType;
  timePeriod?: FundamentalTimePeriod;
  /** Include detailed line items where supported (`fs=true`). */
  fullStatement?: boolean;
};

function statementQuery(options?: FundamentalQueryOptions) {
  return {
    ...(options?.type ? { type: options.type } : {}),
    ...(options?.timePeriod ? { time_period: options.timePeriod } : {}),
    ...(options?.fullStatement ? { fs: "true" } : {}),
  };
}

function sdkStatementOpts(options?: FundamentalQueryOptions): {
  type?: string;
  timePeriod?: string;
  fs?: boolean;
} {
  return {
    ...(options?.type ? { type: options.type } : {}),
    ...(options?.timePeriod ? { timePeriod: options.timePeriod } : {}),
    ...(options?.fullStatement ? { fs: true } : {}),
  };
}

function encodeIsin(isin: string): string {
  return encodeURIComponent(isin.trim().toUpperCase());
}

export async function getCompanyProfile(
  isin: string,
): Promise<UpstoxCompanyProfileResponse> {
  assertIsin(isin);
  const encoded = encodeIsin(isin);
  return withUpstoxTransport({
    sdk: () => upstoxSdk.fundamentals.getCompanyProfile(isin.trim().toUpperCase()),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxCompanyProfileResponse>(
        `/v2/fundamentals/${encoded}/profile`,
      );
    },
  });
}

export async function getKeyRatios(
  isin: string,
): Promise<UpstoxKeyRatiosResponse> {
  assertIsin(isin);
  const encoded = encodeIsin(isin);
  return withUpstoxTransport({
    sdk: () => upstoxSdk.fundamentals.getKeyRatios(isin.trim().toUpperCase()),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxKeyRatiosResponse>(
        `/v2/fundamentals/${encoded}/key-ratios`,
      );
    },
  });
}

export async function getShareHoldings(
  isin: string,
): Promise<UpstoxShareHoldingsResponse> {
  assertIsin(isin);
  const encoded = encodeIsin(isin);
  return withUpstoxTransport({
    sdk: () => upstoxSdk.fundamentals.getShareHoldings(isin.trim().toUpperCase()),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxShareHoldingsResponse>(
        `/v2/fundamentals/${encoded}/share-holdings`,
      );
    },
  });
}

export async function getBalanceSheet(
  isin: string,
  options?: FundamentalQueryOptions,
): Promise<UpstoxSuccessEnvelope<unknown>> {
  assertIsin(isin);
  const encoded = encodeIsin(isin);
  return withUpstoxTransport({
    preferHttp: Boolean(options?.timePeriod),
    sdk: () =>
      upstoxSdk.fundamentals.getBalanceSheet(
        isin.trim().toUpperCase(),
        sdkStatementOpts(options),
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxSuccessEnvelope<unknown>>(
        `/v2/fundamentals/${encoded}/balance-sheet`,
        { query: statementQuery(options) },
      );
    },
  });
}

export async function getIncomeStatement(
  isin: string,
  options?: FundamentalQueryOptions,
): Promise<UpstoxSuccessEnvelope<unknown>> {
  assertIsin(isin);
  const encoded = encodeIsin(isin);
  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.fundamentals.getIncomeStatement(
        isin.trim().toUpperCase(),
        sdkStatementOpts(options),
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxSuccessEnvelope<unknown>>(
        `/v2/fundamentals/${encoded}/income-statement`,
        { query: statementQuery(options) },
      );
    },
  });
}

export async function getCashFlow(
  isin: string,
  options?: FundamentalQueryOptions,
): Promise<UpstoxSuccessEnvelope<unknown>> {
  assertIsin(isin);
  const encoded = encodeIsin(isin);
  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.fundamentals.getCashFlow(
        isin.trim().toUpperCase(),
        sdkStatementOpts(options),
      ),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxSuccessEnvelope<unknown>>(
        `/v2/fundamentals/${encoded}/cash-flow`,
        { query: statementQuery(options) },
      );
    },
  });
}

export async function getCorporateActions(
  isin: string,
): Promise<UpstoxSuccessEnvelope<unknown>> {
  assertIsin(isin);
  const encoded = encodeIsin(isin);
  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.fundamentals.getCorporateActions(isin.trim().toUpperCase()),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxSuccessEnvelope<unknown>>(
        `/v2/fundamentals/${encoded}/corporate-actions`,
      );
    },
  });
}

export async function getCompetitors(
  isinOrInstrumentKey: string,
): Promise<UpstoxCompetitorsResponse> {
  assertNonEmptyString(isinOrInstrumentKey, "identifier");
  const trimmed = isinOrInstrumentKey.trim();
  return withUpstoxTransport({
    sdk: () => upstoxSdk.fundamentals.getCompetitors(trimmed),
    http: () => {
      const client = getUpstoxClient();
      return client.get<UpstoxCompetitorsResponse>(
        `/v2/fundamentals/${encodeURIComponent(trimmed)}/competitors`,
      );
    },
  });
}

/** @deprecated Use getCashFlow */
export const getCashFlowStatement = getCashFlow;
