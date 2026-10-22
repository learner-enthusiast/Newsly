/**
 * Wrapper for external tool calls (SerpApi, Firecrawl, Pexels, …):
 *
 * - cache by sha256(tool + params), with a TTL (`ToolCallCache` table)
 * - retries after 1s / 2s / 4s
 * - per-run budget (cache hits are free)
 * - never throws: returns `null` on failure or when the budget is spent
 *
 * Usage tracking (`ProviderUsage`) stays inside the provider clients.
 */

import { createHash } from "node:crypto";
import type { Prisma } from "@/db/generated/client";

export const CALL_TOOL_RETRY_DELAYS_MS = [1_000, 2_000, 4_000] as const;

export type CallBudget = {
  readonly limit: number;
  used: number;
};

export function createCallBudget(limit: number): CallBudget {
  return { limit, used: 0 };
}

export function remainingBudget(budget: CallBudget): number {
  return Math.max(0, budget.limit - budget.used);
}

export type ToolCallCacheStore = {
  get(key: string, now: Date): Promise<unknown | undefined>;
  set(key: string, tool: string, value: unknown, expiresAt: Date): Promise<void>;
};

/** Loaded lazily so unit tests with an injected cache need no database. */
async function db() {
  return (await import("@/db")).prisma;
}

export const prismaToolCallCache: ToolCallCacheStore = {
  async get(key, now) {
    const prisma = await db();
    const row = await prisma.toolCallCache.findUnique({ where: { key } });
    if (!row || row.expiresAt <= now) {
      return undefined;
    }
    return row.value;
  },
  async set(key, tool, value, expiresAt) {
    const json = value as Prisma.InputJsonValue;
    const prisma = await db();
    await prisma.toolCallCache.upsert({
      where: { key },
      create: { key, tool, value: json, expiresAt },
      update: { value: json, expiresAt, createdAt: new Date() },
    });
  },
};

export type CallToolOptions<T> = {
  /** Stable tool name, e.g. "serp.google_images". */
  tool: string;
  /** Everything that changes the result; hashed into the cache key. */
  params: unknown;
  ttlMs: number;
  budget: CallBudget;
  run: () => Promise<T>;
  /** Treat a resolved value as a failure (retried, never cached). */
  isFailure?: (value: T) => boolean;
  cache?: ToolCallCacheStore;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
};

/** Key order-independent JSON so `{a,b}` and `{b,a}` hash the same. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

export function callToolCacheKey(tool: string, params: unknown): string {
  return createHash("sha256")
    .update(`${tool}\n${stableStringify(params)}`)
    .digest("hex");
}

const defaultSleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function callTool<T>(options: CallToolOptions<T>): Promise<T | null> {
  const cache = options.cache ?? prismaToolCallCache;
  const sleep = options.sleep ?? defaultSleep;
  const now = options.now ?? (() => new Date());
  const key = callToolCacheKey(options.tool, options.params);

  try {
    const cached = await cache.get(key, now());
    if (cached !== undefined) {
      return cached as T;
    }
  } catch (error) {
    console.warn(`[callTool] cache read failed for ${options.tool}`, error);
  }

  if (remainingBudget(options.budget) <= 0) {
    console.warn(`[callTool] budget spent; skipping ${options.tool}`);
    return null;
  }
  options.budget.used += 1;

  for (let attempt = 0; attempt <= CALL_TOOL_RETRY_DELAYS_MS.length; attempt += 1) {
    if (attempt > 0) {
      await sleep(CALL_TOOL_RETRY_DELAYS_MS[attempt - 1]);
    }
    try {
      const value = await options.run();
      if (options.isFailure?.(value)) {
        throw new Error("result rejected by isFailure");
      }
      try {
        await cache.set(
          key,
          options.tool,
          value,
          new Date(now().getTime() + options.ttlMs),
        );
      } catch (error) {
        console.warn(`[callTool] cache write failed for ${options.tool}`, error);
      }
      return value;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(
        `[callTool] ${options.tool} attempt ${attempt + 1} failed: ${message.slice(0, 300)}`,
      );
    }
  }
  return null;
}
