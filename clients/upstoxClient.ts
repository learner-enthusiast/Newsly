/**
 * Upstox Developer API v2 HTTP client
 *
 * Docs: https://upstox.com/developer/api-documentation/api-overview
 * Auth: OAuth 2.0 authorization code → Bearer access token on API calls.
 */

import { z } from "zod";

export const UPSTOX_LIVE_API_BASE_URL = "https://api.upstox.com/v2";
export const UPSTOX_SANDBOX_API_BASE_URL = "https://sandbox.upstox.com/v2";

export const UPSTOX_AUTHORIZATION_DIALOG_PATH =
  "/login/authorization/dialog" as const;
export const UPSTOX_TOKEN_PATH = "/login/authorization/token" as const;

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_INSTRUMENT_KEYS_QUOTES = 500;
const MAX_INSTRUMENT_KEYS_OHLC_LTP = 1000;

/** e.g. NSE_EQ|INE669E01016 */
export const upstoxInstrumentKeySchema = z
  .string()
  .min(3)
  .regex(
    /^[A-Z0-9_]+\|[A-Z0-9.]+$/i,
    "instrument_key must look like EXCHANGE_SEGMENT|ISIN or token id",
  );

const upstoxOhlcIntervalSchema = z.enum(["1d", "I1", "I30"]);

const upstoxNewsCategorySchema = z.enum([
  "instrument_keys",
  "positions",
  "holdings",
]);

const upstoxApiStatusSchema = z.enum(["success", "error", "partial_success"]);

export const upstoxApiEnvelopeSchema = z.object({
  status: upstoxApiStatusSchema,
  data: z.unknown().optional(),
  errors: z.unknown().optional(),
});

export type UpstoxApiEnvelope<T = unknown> = {
  status: z.infer<typeof upstoxApiStatusSchema>;
  data?: T;
  errors?: unknown;
};

export const upstoxTokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string().optional(),
  expires_in: z.number().int().positive().optional(),
  extended_token: z.string().optional(),
});

export type UpstoxTokenResponse = z.infer<typeof upstoxTokenResponseSchema>;

export type UpstoxEnvironment = "live" | "sandbox";

export type UpstoxClientOptions = {
  /** Bearer token for API calls (defaults to UPSTOX_ACCESS_TOKEN). */
  accessToken?: string;
  /** Override full API root including `/v2`. */
  baseUrl?: string;
  environment?: UpstoxEnvironment;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
};

export type UpstoxAuthorizationUrlParams = {
  clientId: string;
  redirectUri: string;
  state?: string;
  /** Defaults to live authorization host (sandbox uses sandbox API host). */
  environment?: UpstoxEnvironment;
};

export type UpstoxAuthorizationCodeExchangeParams = {
  code: string;
  redirectUri: string;
  clientId?: string;
  clientSecret?: string;
  environment?: UpstoxEnvironment;
};

export type UpstoxRequestOptions = {
  accessToken?: string;
  query?: Record<string, string | number | boolean | undefined>;
  signal?: AbortSignal;
  timeoutMs?: number;
};

export class UpstoxApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body: unknown) {
    super(message);
    this.name = "UpstoxApiError";
    this.status = status;
    this.body = body;
  }
}

function readTrimmedEnv(name: string): string | undefined {
  const raw = process.env[name]?.trim();
  return raw && raw.length > 0 ? raw : undefined;
}

export function resolveUpstoxBaseUrl(input?: {
  baseUrl?: string;
  environment?: UpstoxEnvironment;
}): string {
  if (input?.baseUrl?.trim()) {
    return input.baseUrl.replace(/\/+$/, "");
  }
  const envOverride = readTrimmedEnv("UPSTOX_API_BASE_URL");
  if (envOverride) {
    return envOverride.replace(/\/+$/, "");
  }
  const envFlag = readTrimmedEnv("UPSTOX_ENV")?.toLowerCase();
  const environment =
    input?.environment ??
    (envFlag === "sandbox" ? "sandbox" : ("live" as const));
  return environment === "sandbox"
    ? UPSTOX_SANDBOX_API_BASE_URL
    : UPSTOX_LIVE_API_BASE_URL;
}

export function buildUpstoxAuthorizationUrl(
  params: UpstoxAuthorizationUrlParams,
): string {
  const base = resolveUpstoxBaseUrl({ environment: params.environment });
  const url = new URL(`${base}${UPSTOX_AUTHORIZATION_DIALOG_PATH}`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  if (params.state?.trim()) {
    url.searchParams.set("state", params.state.trim());
  }
  return url.toString();
}

function parseInstrumentKeys(keys: string[], max: number): string {
  const parsed = keys.map((key) => upstoxInstrumentKeySchema.parse(key.trim()));
  if (parsed.length === 0) {
    throw new Error("At least one instrument_key is required");
  }
  if (parsed.length > max) {
    throw new Error(`Upstox allows at most ${max} instrument keys per request`);
  }
  return parsed.join(",");
}

function buildQueryString(
  query: Record<string, string | number | boolean | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) {
      continue;
    }
    params.set(key, String(value));
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

async function readResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text.trim()) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

export function createUpstoxClient(options: UpstoxClientOptions = {}) {
  const fetchImpl = options.fetchImpl ?? fetch;
  const defaultTimeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const baseUrl = resolveUpstoxBaseUrl({
    baseUrl: options.baseUrl,
    environment: options.environment,
  });

  const resolveAccessToken = (override?: string): string => {
    const token =
      override?.trim() ??
      options.accessToken?.trim() ??
      readTrimmedEnv("UPSTOX_ACCESS_TOKEN");
    if (!token) {
      throw new Error(
        "Upstox access token is required (pass accessToken or set UPSTOX_ACCESS_TOKEN)",
      );
    }
    return token;
  };

  async function request<T = unknown>(
    path: string,
    init: RequestInit & UpstoxRequestOptions = {},
  ): Promise<T> {
    const timeoutMs = init.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    const queryString = init.query ? buildQueryString(init.query) : "";
    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${baseUrl}${normalizedPath}${queryString}`;

    try {
      const headers = new Headers(init.headers);
      if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
      }
      if (init.accessToken !== undefined || !headers.has("Authorization")) {
        headers.set(
          "Authorization",
          `Bearer ${resolveAccessToken(init.accessToken)}`,
        );
      }

      const response = await fetchImpl(url, {
        ...init,
        headers,
        signal,
      });

      const body = await readResponseBody(response);

      if (!response.ok) {
        throw new UpstoxApiError(
          `Upstox API ${response.status} ${response.statusText}`.trim(),
          response.status,
          body,
        );
      }

      const envelope = upstoxApiEnvelopeSchema.safeParse(body);
      if (envelope.success) {
        if (envelope.data.status === "error") {
          throw new UpstoxApiError(
            "Upstox API returned status=error",
            response.status,
            body,
          );
        }
        return (envelope.data.data ?? body) as T;
      }

      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  async function requestWithoutAuth<T = unknown>(
    path: string,
    init: RequestInit & { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<T> {
    const timeoutMs = init.timeoutMs ?? defaultTimeoutMs;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, controller.signal])
      : controller.signal;

    const normalizedPath = path.startsWith("/") ? path : `/${path}`;
    const url = `${baseUrl}${normalizedPath}`;

    try {
      const headers = new Headers(init.headers);
      if (!headers.has("Accept")) {
        headers.set("Accept", "application/json");
      }

      const response = await fetchImpl(url, { ...init, headers, signal });
      const body = await readResponseBody(response);

      if (!response.ok) {
        throw new UpstoxApiError(
          `Upstox API ${response.status} ${response.statusText}`.trim(),
          response.status,
          body,
        );
      }

      return body as T;
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    baseUrl,

    buildAuthorizationUrl(params: Omit<UpstoxAuthorizationUrlParams, "environment">) {
      return buildUpstoxAuthorizationUrl({
        ...params,
        environment: options.environment,
      });
    },

    async exchangeAuthorizationCode(
      params: UpstoxAuthorizationCodeExchangeParams,
    ): Promise<UpstoxTokenResponse> {
      const clientId =
        params.clientId?.trim() ?? readTrimmedEnv("UPSTOX_CLIENT_ID");
      const clientSecret =
        params.clientSecret?.trim() ?? readTrimmedEnv("UPSTOX_CLIENT_SECRET");
      if (!clientId || !clientSecret) {
        throw new Error(
          "UPSTOX_CLIENT_ID and UPSTOX_CLIENT_SECRET are required for token exchange",
        );
      }

      const tokenBase = resolveUpstoxBaseUrl({
        environment: params.environment ?? options.environment,
      });
      const body = new URLSearchParams({
        code: params.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: params.redirectUri,
        grant_type: "authorization_code",
      });

      const timeoutMs = defaultTimeoutMs;
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetchImpl(`${tokenBase}${UPSTOX_TOKEN_PATH}`, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body,
          signal: controller.signal,
        });

        const json = await readResponseBody(response);
        if (!response.ok) {
          throw new UpstoxApiError(
            `Upstox token exchange failed (${response.status})`,
            response.status,
            json,
          );
        }

        return upstoxTokenResponseSchema.parse(json);
      } finally {
        clearTimeout(timeout);
      }
    },

    request,

    async getUserProfile(requestOptions: UpstoxRequestOptions = {}) {
      return request<unknown>("/user/profile", {
        method: "GET",
        ...requestOptions,
      });
    },

    async getFullMarketQuote(input: {
      instrumentKeys: string[];
      accessToken?: string;
      signal?: AbortSignal;
    }) {
      return request<Record<string, unknown>>("/market-quote/quotes", {
        method: "GET",
        accessToken: input.accessToken,
        signal: input.signal,
        query: {
          instrument_key: parseInstrumentKeys(
            input.instrumentKeys,
            MAX_INSTRUMENT_KEYS_QUOTES,
          ),
        },
      });
    },

    async getMarketQuoteOhlc(input: {
      instrumentKeys: string[];
      interval: z.infer<typeof upstoxOhlcIntervalSchema>;
      accessToken?: string;
      signal?: AbortSignal;
    }) {
      upstoxOhlcIntervalSchema.parse(input.interval);
      return request<Record<string, unknown>>("/market-quote/ohlc", {
        method: "GET",
        accessToken: input.accessToken,
        signal: input.signal,
        query: {
          instrument_key: parseInstrumentKeys(
            input.instrumentKeys,
            MAX_INSTRUMENT_KEYS_OHLC_LTP,
          ),
          interval: input.interval,
        },
      });
    },

    async getMarketQuoteLtp(input: {
      instrumentKeys: string[];
      accessToken?: string;
      signal?: AbortSignal;
    }) {
      return request<Record<string, unknown>>("/market-quote/ltp", {
        method: "GET",
        accessToken: input.accessToken,
        signal: input.signal,
        query: {
          instrument_key: parseInstrumentKeys(
            input.instrumentKeys,
            MAX_INSTRUMENT_KEYS_OHLC_LTP,
          ),
        },
      });
    },

    async getHistoricalCandles(input: {
      instrumentKey: string;
      interval: string;
      toDate: string;
      fromDate?: string;
      accessToken?: string;
      signal?: AbortSignal;
    }) {
      const instrumentKey = encodeURIComponent(
        upstoxInstrumentKeySchema.parse(input.instrumentKey.trim()),
      );
      const interval = encodeURIComponent(input.interval.trim());
      const toDate = encodeURIComponent(input.toDate.trim());
      const path = input.fromDate
        ? `/historical-candle/${instrumentKey}/${interval}/${toDate}/${encodeURIComponent(input.fromDate.trim())}`
        : `/historical-candle/${instrumentKey}/${interval}/${toDate}`;

      return request<unknown>(path, {
        method: "GET",
        accessToken: input.accessToken,
        signal: input.signal,
      });
    },

    async getIntradayCandles(input: {
      instrumentKey: string;
      interval: string;
      accessToken?: string;
      signal?: AbortSignal;
    }) {
      const instrumentKey = encodeURIComponent(
        upstoxInstrumentKeySchema.parse(input.instrumentKey.trim()),
      );
      const interval = encodeURIComponent(input.interval.trim());
      return request<unknown>(
        `/historical-candle/intraday/${instrumentKey}/${interval}`,
        {
          method: "GET",
          accessToken: input.accessToken,
          signal: input.signal,
        },
      );
    },

    async getNews(input: {
      category: z.infer<typeof upstoxNewsCategorySchema>;
      instrumentKeys?: string[];
      pageNumber?: number;
      pageSize?: number;
      accessToken?: string;
      signal?: AbortSignal;
    }) {
      const category = upstoxNewsCategorySchema.parse(input.category);
      const instrumentKeys =
        input.instrumentKeys && input.instrumentKeys.length > 0
          ? parseInstrumentKeys(input.instrumentKeys, MAX_INSTRUMENT_KEYS_QUOTES)
          : undefined;

      if (category === "instrument_keys" && !instrumentKeys) {
        throw new Error(
          "instrumentKeys are required when news category is instrument_keys",
        );
      }

      return request<unknown>("/news", {
        method: "GET",
        accessToken: input.accessToken,
        signal: input.signal,
        query: {
          category,
          instrument_keys: instrumentKeys,
          page_number: input.pageNumber,
          page_size: input.pageSize,
        },
      });
    },

    /** Raw GET without Bearer (e.g. future public metadata). */
    requestWithoutAuth,
  };
}

/** Lazy singleton — requires UPSTOX_ACCESS_TOKEN when calling authenticated methods. */
export const upstoxClient = createUpstoxClient();
