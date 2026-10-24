/**
 * Re-export — Newsly keeps the implementation in `clients/` (shared HTTP client convention).
 * This is the **fallback** HTTP client when `upstox-js-sdk` does not cover an endpoint.
 * Import from `@/client/upstoxClient` or `@/clients/upstoxClient`.
 */
export * from "@/clients/upstoxClient";
