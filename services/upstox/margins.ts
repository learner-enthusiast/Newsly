import { UpstoxApiError } from "@/clients/upstoxClient";

/**
 * Upstox Margin API uses `POST /v2/charges/margin` with a JSON body.
 *
 * The Analytics Token is documented as **read-only** and supports **GET** APIs only
 * within eligible categories. Newsly uses an Analytics Token for general market research,
 * not per-user OAuth tokens — so margin calculation is **not implemented** here.
 *
 * @see https://upstox.com/developer/api-documentation/margin/
 * @see https://upstox.com/developer/api-documentation/analytics-token/
 */
export const MARGIN_API_NOT_SUPPORTED_WITH_ANALYTICS_TOKEN =
  "Upstox Margin API requires POST /v2/charges/margin. Newsly's UPSTOX_ANALYTICS_TOKEN is read-only (GET-only). Use OAuth user tokens outside this provider layer if margin calculation is required.";

/** Throws — margins are unavailable with the Analytics Token integration. */
export function assertMarginApiNotUsed(): never {
  throw new UpstoxApiError(MARGIN_API_NOT_SUPPORTED_WITH_ANALYTICS_TOKEN, {
    kind: "invalid_request",
    status: 0,
  });
}
