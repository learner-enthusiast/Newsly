/**
 * Server-only HTTP client for Upstox REST APIs (Analytics Token).
 *
 * Fallback transport for officially supported Analytics Token APIs that are not
 * exposed (or not complete) in the installed `upstox-js-sdk`. Prefer the SDK via
 * `services/upstox/upstoxSdk.ts` for all other calls.
 *
 * No business logic — use services/upstox/* for Newsly-facing APIs.
 */

export type UpstoxErrorKind =
  | "missing_token"
  | "authentication"
  | "invalid_request"
  | "not_found"
  | "rate_limit"
  | "server"
  | "timeout"
  | "malformed";

export class UpstoxApiError extends Error {
  readonly kind: UpstoxErrorKind;
  readonly status: number;
  readonly errorCode?: string;

  constructor(
    message: string,
    options: {
      kind: UpstoxErrorKind;
      status: number;
      errorCode?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = "UpstoxApiError";
    this.kind = options.kind;
    this.status = options.status;
    this.errorCode = options.errorCode;
  }
}

export type UpstoxQueryValue =
  | string
  | number
  | boolean
  | undefined
  | null
  | string[];

export type UpstoxGetOptions = {
  query?: Record<string, UpstoxQueryValue>;
  timeoutMs?: number;
  /** Skip retries for this request (used in tests). */
  noRetry?: boolean;
  /** Optional cancellation (merged with request timeout when both are set). */
  signal?: AbortSignal;
};

export type UpstoxClientOptions = {
  analyticsToken?: string;
  baseUrl?: string;
  defaultTimeoutMs?: number;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
};

const DEFAULT_BASE_URL = "https://api.upstox.com";
const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

function readAnalyticsToken(explicit?: string): string {
  const token = (explicit ?? process.env.UPSTOX_ANALYTICS_TOKEN)?.trim();
  if (!token) {
    throw new UpstoxApiError(
      "UPSTOX_ANALYTICS_TOKEN is not configured.",
      { kind: "missing_token", status: 0 },
    );
  }
  return token;
}

function buildQueryString(query: Record<string, UpstoxQueryValue>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value == null) {
      continue;
    }
    if (Array.isArray(value)) {
      for (const item of value) {
        params.append(key, item);
      }
    } else {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized ? `?${serialized}` : "";
}

function classifyHttpError(status: number): UpstoxErrorKind {
  if (status === 401 || status === 403) {
    return "authentication";
  }
  if (status === 404) {
    return "not_found";
  }
  if (status === 429) {
    return "rate_limit";
  }
  if (status === 400 || status === 422) {
    return "invalid_request";
  }
  if (status >= 500) {
    return "server";
  }
  return "invalid_request";
}

type UpstoxErrorBody = {
  status?: string;
  errors?: Array<{ errorCode?: string; message?: string }>;
  message?: string;
};

function messageFromBody(body: UpstoxErrorBody, fallback: string): string {
  const first = body.errors?.[0];
  if (first?.message) {
    return first.errorCode
      ? `${first.errorCode}: ${first.message}`
      : first.message;
  }
  if (body.message) {
    return body.message;
  }
  return fallback;
}

function errorCodeFromBody(body: UpstoxErrorBody): string | undefined {
  return body.errors?.[0]?.errorCode;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function mergeAbortSignals(
  timeoutMs: number,
  userSignal?: AbortSignal,
): AbortSignal {
  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  if (userSignal == null) {
    return timeoutSignal;
  }
  const merged = new AbortController();
  const abortFrom = (source: AbortSignal) => {
    if (!merged.signal.aborted) {
      merged.abort(source.reason);
    }
  };
  if (timeoutSignal.aborted) {
    abortFrom(timeoutSignal);
    return merged.signal;
  }
  if (userSignal.aborted) {
    abortFrom(userSignal);
    return merged.signal;
  }
  timeoutSignal.addEventListener("abort", () => abortFrom(timeoutSignal), {
    once: true,
  });
  userSignal.addEventListener("abort", () => abortFrom(userSignal), {
    once: true,
  });
  return merged.signal;
}

export function createUpstoxClient(options: UpstoxClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;

  async function requestJson<T>(
    method: "GET" | "POST",
    path: string,
    init: {
      query?: Record<string, UpstoxQueryValue>;
      body?: unknown;
      timeoutMs?: number;
      noRetry?: boolean;
      signal?: AbortSignal;
    },
  ): Promise<T> {
    const token = readAnalyticsToken(options.analyticsToken);
    const timeoutMs = init.timeoutMs ?? defaultTimeoutMs;
    const queryString = init.query ? buildQueryString(init.query) : "";
    const url = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}${queryString}`;

    const requestSignal = mergeAbortSignals(timeoutMs, init.signal);

    let lastError: unknown;

    const attempts = init.noRetry ? 1 : maxRetries + 1;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      if (attempt > 0) {
        await sleep(250 * 2 ** (attempt - 1));
      }

      try {
        const response = await fetchImpl(url, {
          method,
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body:
            method === "POST" && init.body != null
              ? JSON.stringify(init.body)
              : undefined,
          signal: requestSignal,
        });

        const text = await response.text();
        let parsed: unknown = null;
        if (text.length > 0) {
          try {
            parsed = JSON.parse(text) as unknown;
          } catch {
            throw new UpstoxApiError("Upstox returned non-JSON response.", {
              kind: "malformed",
              status: response.status,
            });
          }
        }

        if (!response.ok) {
          const body = (parsed ?? {}) as UpstoxErrorBody;
          const kind = classifyHttpError(response.status);
          throw new UpstoxApiError(
            messageFromBody(body, `Upstox request failed (${response.status})`),
            {
              kind,
              status: response.status,
              errorCode: errorCodeFromBody(body),
            },
          );
        }

        if (
          parsed &&
          typeof parsed === "object" &&
          "status" in parsed &&
          (parsed as { status?: string }).status === "error"
        ) {
          const body = parsed as UpstoxErrorBody;
          throw new UpstoxApiError(
            messageFromBody(body, "Upstox API returned error status"),
            {
              kind: "invalid_request",
              status: response.status,
              errorCode: errorCodeFromBody(body),
            },
          );
        }

        return parsed as T;
      } catch (error) {
        lastError = error;
        if (error instanceof UpstoxApiError) {
          if (
            error.kind === "missing_token" ||
            error.kind === "authentication" ||
            error.kind === "invalid_request" ||
            error.kind === "not_found" ||
            error.kind === "malformed"
          ) {
            throw error;
          }
          if (
            !init.noRetry &&
            (error.kind === "rate_limit" || error.kind === "server") &&
            attempt < attempts - 1
          ) {
            continue;
          }
          throw error;
        }
        if (error instanceof Error && error.name === "TimeoutError") {
          const timeoutError = new UpstoxApiError("Upstox request timed out.", {
            kind: "timeout",
            status: 0,
            cause: error,
          });
          if (!init.noRetry && attempt < attempts - 1) {
            lastError = timeoutError;
            continue;
          }
          throw timeoutError;
        }
        if (!init.noRetry && attempt < attempts - 1) {
          continue;
        }
        throw new UpstoxApiError("Upstox network request failed.", {
          kind: "server",
          status: 0,
          cause: error,
        });
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new UpstoxApiError("Upstox request failed.", {
          kind: "server",
          status: 0,
        });
  }

  return {
    get<T>(path: string, options?: UpstoxGetOptions): Promise<T> {
      return requestJson<T>("GET", path, {
        query: options?.query,
        timeoutMs: options?.timeoutMs,
        noRetry: options?.noRetry,
        signal: options?.signal,
      });
    },

    post<T>(
      path: string,
      body?: unknown,
      options?: Omit<UpstoxGetOptions, "query">,
    ): Promise<T> {
      return requestJson<T>("POST", path, {
        body,
        timeoutMs: options?.timeoutMs,
        noRetry: options?.noRetry,
        signal: options?.signal,
      });
    },
  };
}

export type UpstoxHttpClient = ReturnType<typeof createUpstoxClient>;

let cachedClient: UpstoxHttpClient | null = null;

export function getUpstoxClient(): UpstoxHttpClient {
  cachedClient ??= createUpstoxClient();
  return cachedClient;
}

/** @internal Test hook — replace or clear the process-wide client singleton. */
export function __setUpstoxClientForTests(
  client: UpstoxHttpClient | null,
): void {
  cachedClient = client;
}

export function isUpstoxConfigured(): boolean {
  const token = process.env.UPSTOX_ANALYTICS_TOKEN?.trim();
  return Boolean(token && token.length > 0);
}
