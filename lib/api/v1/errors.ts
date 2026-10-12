/**
 * The one error shape of the public API:
 * `{ error: { code, message, details?, requestId } }`.
 *
 * Throw `ApiError` from a v1 handler (or anything it calls) to answer with a
 * specific status; any other throw becomes a generic 500 whose message never
 * includes the original error.
 */

export const API_ERROR_CODES = [
  "invalid_request",
  "unauthorized",
  "plan_required",
  "forbidden",
  "not_found",
  "method_not_allowed",
  "conflict",
  "idempotency_key_reused",
  "payload_too_large",
  "unsupported_media_type",
  "limit_reached",
  "rate_limited",
  "quota_exceeded",
  "internal_error",
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export const API_ERROR_STATUS: Record<ApiErrorCode, number> = {
  invalid_request: 400,
  unauthorized: 401,
  plan_required: 403,
  forbidden: 403,
  not_found: 404,
  method_not_allowed: 405,
  conflict: 409,
  idempotency_key_reused: 422,
  payload_too_large: 413,
  unsupported_media_type: 415,
  limit_reached: 409,
  rate_limited: 429,
  quota_exceeded: 429,
  internal_error: 500,
};

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly headers?: Record<string, string>;

  constructor(
    code: ApiErrorCode,
    message: string,
    options: { details?: unknown; headers?: Record<string, string> } = {},
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = API_ERROR_STATUS[code];
    this.details = options.details;
    this.headers = options.headers;
  }
}

export type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
    requestId: string;
  };
};

export function apiErrorBody(error: ApiError, requestId: string): ApiErrorBody {
  return {
    error: {
      code: error.code,
      message: error.message,
      ...(error.details !== undefined ? { details: error.details } : {}),
      requestId,
    },
  };
}

export const INTERNAL_ERROR_MESSAGE =
  "Something went wrong on our side. Retry later and quote the requestId if it keeps happening.";

export function notFound(what: string): ApiError {
  return new ApiError("not_found", `${what} not found.`);
}
