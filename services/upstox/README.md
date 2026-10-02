# Upstox provider layer (Newsly)

Server-only integration for **general market and financial research** using an Upstox **Analytics Token**. This layer does not connect end-user Upstox accounts, does not use OAuth, and does not call portfolio, orders, payments, or trading APIs.

## Setup

1. Create an Analytics Token in the [Upstox Developer Console](https://upstox.com/developer/) (Developer Apps → Analytics).
2. Set **`UPSTOX_ANALYTICS_TOKEN`** in your server environment (see `.env.example`).
3. Never expose the token to the browser, client bundles, logs, or error messages.

Connectivity check:

```bash
pnpm upstox:test
```

## Architecture

```
Newsly research / agents
        ↓
services/upstox/*
        ↓
   ┌────┴────┐
   ▼         ▼
upstox-js-sdk   clients/upstoxClient.ts (fallback)
   (primary)     also: client/upstoxClient.ts
   └────┬────┘
        ▼
Upstox REST / WebSocket APIs
```

Server token configuration lives in `services/upstox/upstoxSdk.ts` (`UPSTOX_ANALYTICS_TOKEN` → SDK `OAUTH2.accessToken`). This is **not** a user OAuth login flow.

HTTP fallback is used when:

- `UPSTOX_USE_HTTP_FALLBACK=true` is set, or
- `__forceUpstoxHttpFallbackForTests(true)` in unit tests, or
- a specific endpoint is incomplete in the SDK (e.g. balance sheet `time_period` → HTTP via `preferHttp`).

## Implemented services

| Module | Functions | Upstox API |
| --- | --- | --- |
| `charges.ts` | `getBrokerageCharges` | `GET /v2/charges/brokerage` |
| `marketQuote.ts` | `getFullMarketQuotes`, `getOhlcQuotes`, `getLtpQuotes`, `getOptionGreeks` | V3 market quote |
| `historicalData.ts` | `getHistoricalCandles`, `getIntradayCandles` | V3 historical / intraday candles |
| `optionChain.ts` | `getOptionChain`, `getOptionContracts` | `GET /v2/option/chain`, `/contract` |
| `marketInformation.ts` | FII/DII, OI, change-OI, max pain, PCR, holidays, timings, exchange status | `GET /v2/market/*` |
| `fundamentals.ts` | Profile, ratios, shareholdings, statements, corporate actions, competitors | `GET /v2/fundamentals/{isin}/*` |
| `news.ts` | `getInstrumentNews` (`category=instrument_keys` only) | `GET /v2/news` |
| `ipo.ts` | `getIpos`, `getIpoDetails` | `GET /v2/ipos`, `/v2/ipos/{id}` |
| `marketDataWebsocket.ts` | `authorizeMarketDataFeed`, `createMarketDataStreamer`, `UpstoxMarketDataFeedClient` | SDK `MarketDataStreamerV3` (+ HTTP authorize fallback) |

Official docs: [Upstox Developer API](https://upstox.com/developer/api-documentation/).

## Not implemented (by design)

| Category | Reason |
| --- | --- |
| **Margins** (`POST /v2/charges/margin`) | Analytics Token is **read-only (GET-only)**. See `services/upstox/margins.ts`. |
| User, portfolio, orders, GTT, payments, MF account, P&amp;L | Account-specific; not general research. |
| News `category=positions` / `holdings` | User-specific; Newsly uses `instrument_keys` only. |
| OAuth / user access tokens | Out of scope for Newsly Analytics Token integration. |

## WebSocket (Market Data Feed V3)

1. `authorizeMarketDataFeed()` → one-time `wss://` URL (`GET /v3/feed/market-data-feed/authorize`).
2. Connect with `UpstoxMarketDataFeedClient` (uses `ws` + official [MarketDataFeed.proto](./proto/MarketDataFeed.proto)).
3. Subscribe with JSON control messages (`sub`, `unsub`, `change_mode`); market payloads are **binary protobuf**.

Modes: `ltpc`, `full`, `full_d30`, `option_greeks` (per Upstox docs).

## Error handling

All HTTP services use `UpstoxApiError` from `clients/upstoxClient.ts` (`missing_token`, `authentication`, `invalid_request`, `not_found`, `rate_limit`, `server`, `timeout`, `malformed`). Input validation throws `invalid_request` before network I/O.

## Tests

```bash
pnpm test:upstox
```

Tests mock HTTP/WebSocket; they do not call live Upstox APIs.

## Types

Provider response shapes live in `services/upstox/types.ts` (Upstox field names and structures). Keep Newsly domain/normalized types in research-layer code, not in this folder.
