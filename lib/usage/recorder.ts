/**
 * Fire-and-forget writer for `ProviderUsage` rows. Rows are buffered in memory
 * and written with `createMany` every few seconds, when the buffer fills, at
 * the end of every Inngest step (middleware) and after location API responses.
 *
 * Nothing here ever throws or blocks a provider call: failures are logged with
 * `console.warn` and the rows are dropped.
 */

import { prisma } from "@/db";
import type { Prisma } from "@/db/generated/client";

export type ProviderUsageRow = Prisma.ProviderUsageCreateManyInput;

const FLUSH_INTERVAL_MS = 3_000;
const MAX_BUFFERED_ROWS = 100;

let buffer: ProviderUsageRow[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
let inFlight: Promise<void> = Promise.resolve();
let exitHookInstalled = false;

/** Deployment label stored on every row. */
export function usageEnvironment(): string {
  return (
    process.env.USAGE_ENVIRONMENT?.trim() ||
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

function ensureBackgroundFlush() {
  if (!timer) {
    timer = setInterval(() => void flushProviderUsage(), FLUSH_INTERVAL_MS);
    // Never keep a script or worker alive just for usage logging.
    timer.unref?.();
  }
  if (!exitHookInstalled && typeof process !== "undefined" && process.once) {
    exitHookInstalled = true;
    // Scripts: write what's left once the event loop drains.
    process.once("beforeExit", () => void flushProviderUsage());
  }
}

/** Queue one row. Never throws. */
export function recordProviderUsage(row: ProviderUsageRow): void {
  try {
    buffer.push(row);
    ensureBackgroundFlush();
    if (buffer.length >= MAX_BUFFERED_ROWS) {
      void flushProviderUsage();
    }
  } catch (error) {
    warn(error);
  }
}

/** Write buffered rows. Safe to call often and concurrently; never throws. */
export function flushProviderUsage(): Promise<void> {
  inFlight = inFlight.then(async () => {
    if (buffer.length === 0) {
      return;
    }
    const rows = buffer;
    buffer = [];
    try {
      await prisma.providerUsage.createMany({ data: rows });
    } catch (error) {
      if (rows.length === 1) {
        warn(error, 1);
        return;
      }
      // One bad row fails the whole batch; retry row by row so only it is lost.
      const results = await Promise.allSettled(
        rows.map((row) => prisma.providerUsage.create({ data: row })),
      );
      const failed = results.filter((r) => r.status === "rejected");
      if (failed.length > 0) {
        warn((failed[0] as PromiseRejectedResult).reason, failed.length);
      }
    }
  });
  return inFlight;
}

function warn(error: unknown, droppedRows?: number) {
  const detail = error instanceof Error ? error.message : String(error);
  const dropped = droppedRows ? ` (${droppedRows} rows dropped)` : "";
  console.warn(`[usage] could not record provider usage${dropped}: ${detail}`);
}
