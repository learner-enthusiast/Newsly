import { isUpstoxConfigured } from "@/clients/upstoxClient";
import { getExchangeStatus } from "@/services/upstox/marketInformation";

export type UpstoxConnectionTestResult =
  | {
      ok: true;
      exchange: string;
      status: string;
      lastUpdatedMs: number | null;
    }
  | {
      ok: false;
      reason: "not_configured" | "api_error";
      message: string;
    };

/**
 * Read-only sanity check that `UPSTOX_ANALYTICS_TOKEN` works.
 * Uses NSE exchange status (no trading or user data).
 */
export async function testUpstoxConnection(
  exchange = "NSE",
): Promise<UpstoxConnectionTestResult> {
  if (!isUpstoxConfigured()) {
    return {
      ok: false,
      reason: "not_configured",
      message: "UPSTOX_ANALYTICS_TOKEN is not set.",
    };
  }

  try {
    const response = await getExchangeStatus(exchange);
    return {
      ok: true,
      exchange: response.data?.exchange ?? exchange,
      status: response.data?.status ?? "unknown",
      lastUpdatedMs: response.data?.last_updated ?? null,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Upstox connection test failed.";
    return {
      ok: false,
      reason: "api_error",
      message,
    };
  }
}
