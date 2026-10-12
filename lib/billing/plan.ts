/**
 * Single source of truth for "is this user Pro?" outside the signed-in web
 * flow (public API keys, Developers page). Computes the plan from
 * `User.plan` + `Subscription.currentPeriodEnd` with the same grace rule as the
 * app (`isProSubscriberPlan`) — it never relies on the lazy
 * `reconcileExpiredProSubscription`, which only runs on web requests.
 *
 * Cached per user for `API_PLAN_CACHE_TTL_MS` (default 60s) in an in-memory LRU.
 * The cache is per server instance: `invalidateUserPlan` clears this instance
 * immediately; other instances pick the change up within the TTL.
 */

import { prisma } from "@/db";
import { isProSubscriberPlan } from "@/services/billing/userPlanAccess";

export type PlanTier = "free" | "pro";

const DEFAULT_TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;

function cacheTtlMs(): number {
  const raw = Number.parseInt(process.env.API_PLAN_CACHE_TTL_MS ?? "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_TTL_MS;
}

type CacheEntry = { plan: PlanTier; expiresAt: number };

// Map keeps insertion order: re-inserting on read makes it an LRU.
const cache = new Map<string, CacheEntry>();

function readCache(userId: string): PlanTier | null {
  const entry = cache.get(userId);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt <= Date.now()) {
    cache.delete(userId);
    return null;
  }
  cache.delete(userId);
  cache.set(userId, entry);
  return entry.plan;
}

function writeCache(userId: string, plan: PlanTier): void {
  const ttl = cacheTtlMs();
  if (ttl === 0) {
    return;
  }
  cache.delete(userId);
  cache.set(userId, { plan, expiresAt: Date.now() + ttl });
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) {
      break;
    }
    cache.delete(oldest);
  }
}

/** Effective plan for a user id (`User.id`, not the Clerk id). Unknown users are free. */
export async function getUserPlan(userId: string): Promise<PlanTier> {
  const cached = readCache(userId);
  if (cached) {
    return cached;
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      plan: true,
      subscription: { select: { currentPeriodEnd: true } },
    },
  });

  const plan: PlanTier =
    user &&
    isProSubscriberPlan(user.plan, user.subscription?.currentPeriodEnd ?? null)
      ? "pro"
      : "free";

  writeCache(userId, plan);
  return plan;
}

/** Call after any plan change (payment confirmed, expiry reconciled). */
export function invalidateUserPlan(userId: string): void {
  cache.delete(userId);
}
