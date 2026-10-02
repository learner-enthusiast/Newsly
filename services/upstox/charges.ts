import { getUpstoxClient } from "@/clients/upstoxClient";
import type { UpstoxBrokerageResponse } from "@/services/upstox/types";
import { upstoxSdk, withUpstoxTransport } from "@/services/upstox/upstoxSdk";
import {
  assertInstrumentKey,
  assertNonEmptyString,
  upstoxInputError,
} from "@/services/upstox/validation";

/** Upstox product codes (see Brokerage API docs). */
export type UpstoxBrokerageProduct = "D" | "I" | "MTF" | string;

export type UpstoxBrokerageTransactionType = "BUY" | "SELL" | string;

export type GetBrokerageParams = {
  instrumentToken: string;
  quantity: number;
  product: UpstoxBrokerageProduct;
  transactionType: UpstoxBrokerageTransactionType;
  price: number;
};

async function getBrokerageChargesHttp(
  params: GetBrokerageParams,
): Promise<UpstoxBrokerageResponse> {
  const client = getUpstoxClient();
  return client.get<UpstoxBrokerageResponse>("/v2/charges/brokerage", {
    query: {
      instrument_token: params.instrumentToken.trim(),
      quantity: params.quantity,
      product: params.product.trim(),
      transaction_type: params.transactionType.trim(),
      price: params.price,
    },
  });
}

/**
 * `GET /v2/charges/brokerage` — read-only brokerage/charges estimate.
 * @see https://upstox.com/developer/api-documentation/get-brokerage/
 */
export async function getBrokerageCharges(
  params: GetBrokerageParams,
): Promise<UpstoxBrokerageResponse> {
  assertInstrumentKey(params.instrumentToken);
  if (
    !Number.isFinite(params.quantity) ||
    !Number.isInteger(params.quantity) ||
    params.quantity <= 0
  ) {
    throw upstoxInputError("quantity must be a positive integer.");
  }
  assertNonEmptyString(params.product, "product");
  assertNonEmptyString(params.transactionType, "transaction_type");
  if (!Number.isFinite(params.price) || params.price <= 0) {
    throw upstoxInputError("price must be greater than zero.");
  }

  return withUpstoxTransport({
    sdk: () =>
      upstoxSdk.charges.getBrokerage(
        params.instrumentToken.trim(),
        params.quantity,
        params.product.trim(),
        params.transactionType.trim(),
        params.price,
      ),
    http: () => getBrokerageChargesHttp(params),
  });
}
