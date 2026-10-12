/**
 * Per-key request rate limiting for the public API.
 *
 * Sliding-window counter: one counter per key per fixed minute, and the
 * request rate is estimated as `previous * (1 - elapsed/window) + current`.
 * That smooths the burst a fixed window allows at the boundary without
 * storing one row per request. Rejected requests are not counted.
 *
 * `RateLimiter` is the seam for moving to Upstash/Redis later: the handler
 * only depends on the interface.
 */

import { prisma } from "@/db";

export const RATE_LIMIT_WINDOW_MS = 60_000;

export type RateLimitResult = {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** End of the current fixed window (X-RateLimit-Reset). */
  resetAt: Date;
  /** Seconds until a request would be allowed again (0 when allowed). */
  retryAfterSeconds: number;
};

export interface RateLimiter {
  consume(bucket: string, limit: number, now?: Date): Promise<RateLimitResult>;
}

function windowStartOf(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

/**
 * Pure decision for one request. `current` already includes this request.
 * Exported for tests and for alternative stores.
 */
export function slidingWindowDecision(input: {
  previous: number;
  current: number;
  limit: number;
  now: Date;
  windowMs?: number;
}): RateLimitResult {
  const windowMs = input.windowMs ?? RATE_LIMIT_WINDOW_MS;
  const windowStart = windowStartOf(input.now, windowMs);
  const elapsed = input.now.getTime() - windowStart.getTime();
  const previousWeight = 1 - elapsed / windowMs;
  const estimate = input.previous * previousWeight + input.current;
  const resetAt = new Date(windowStart.getTime() + windowMs);

  if (estimate <= input.limit) {
    return {
      allowed: true,
      limit: input.limit,
      remaining: Math.max(0, Math.floor(input.limit - estimate)),
      resetAt,
      retryAfterSeconds: 0,
    };
  }

  // Without this request the window holds `current - 1`. Find the first
  // moment `previous * (1 - t/window) + current <= limit`.
  let waitMs: number;
  if (input.current > input.limit || input.previous === 0) {
    waitMs = resetAt.getTime() - input.now.getTime();
  } else {
    const needed = windowMs * (1 - (input.limit - input.current) / input.previous);
    waitMs = Math.max(0, needed - elapsed);
  }

  return {
    allowed: false,
    limit: input.limit,
    remaining: 0,
    resetAt,
    retryAfterSeconds: Math.max(1, Math.ceil(waitMs / 1000)),
  };
}

export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly windowMs = RATE_LIMIT_WINDOW_MS) {}

  async consume(bucket: string, limit: number, now = new Date()): Promise<RateLimitResult> {
    const windowStart = windowStartOf(now, this.windowMs);
    const previousStart = new Date(windowStart.getTime() - this.windowMs);

    // Count first (atomic upsert), then undo if over the limit, so concurrent
    // requests can never all slip in on the same read.
    const [row] = await prisma.$queryRaw<{ current: number; previous: number }[]>`
      WITH bumped AS (
        INSERT INTO api_rate_limit_windows (bucket, window_start, count)
        VALUES (${bucket}, ${windowStart}, 1)
        ON CONFLICT (bucket, window_start)
        DO UPDATE SET count = api_rate_limit_windows.count + 1
        RETURNING count
      )
      SELECT
        (SELECT count FROM bumped)::int AS current,
        COALESCE((
          SELECT count FROM api_rate_limit_windows
          WHERE bucket = ${bucket} AND window_start = ${previousStart}
        ), 0)::int AS previous
    `;

    const decision = slidingWindowDecision({
      previous: row?.previous ?? 0,
      current: row?.current ?? 1,
      limit,
      now,
      windowMs: this.windowMs,
    });

    if (!decision.allowed) {
      await prisma.$executeRaw`
        UPDATE api_rate_limit_windows SET count = count - 1
        WHERE bucket = ${bucket} AND window_start = ${windowStart} AND count > 0
      `;
    }
    return decision;
  }
}

/** In-process limiter with the same math; for tests and local scripts. */
export class MemoryRateLimiter implements RateLimiter {
  private readonly counts = new Map<string, number>();

  constructor(private readonly windowMs = RATE_LIMIT_WINDOW_MS) {}

  async consume(bucket: string, limit: number, now = new Date()): Promise<RateLimitResult> {
    const windowStart = windowStartOf(now, this.windowMs).getTime();
    const currentKey = `${bucket}|${windowStart}`;
    const previousKey = `${bucket}|${windowStart - this.windowMs}`;
    const current = (this.counts.get(currentKey) ?? 0) + 1;
    const decision = slidingWindowDecision({
      previous: this.counts.get(previousKey) ?? 0,
      current,
      limit,
      now,
      windowMs: this.windowMs,
    });
    if (decision.allowed) {
      this.counts.set(currentKey, current);
    }
    return decision;
  }
}

/** Daily cleanup: windows older than `olderThan` are never read again. */
export async function deleteOldRateLimitWindows(olderThan: Date): Promise<number> {
  const result = await prisma.apiRateLimitWindow.deleteMany({
    where: { windowStart: { lt: olderThan } },
  });
  return result.count;
}
