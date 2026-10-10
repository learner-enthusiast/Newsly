import type { UserPlan } from "@/db/generated/client";

export type { UserPlan };

/** Days after `currentPeriodEnd` before Pro access is denied. */
export const PRO_SUBSCRIPTION_GRACE_DAYS = 5;

const PRO_GRACE_MS = PRO_SUBSCRIPTION_GRACE_DAYS * 24 * 60 * 60 * 1000;

function parsePeriodEnd(
  currentPeriodEnd: Date | string | null | undefined,
): Date | null {
  if (currentPeriodEnd == null) {
    return null;
  }
  const date =
    currentPeriodEnd instanceof Date
      ? currentPeriodEnd
      : new Date(currentPeriodEnd);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Last instant (exclusive boundary) the user still counts as Pro by period end + grace. */
export function proAccessGraceEndsAt(
  currentPeriodEnd: Date | string | null | undefined,
): Date | null {
  const end = parsePeriodEnd(currentPeriodEnd);
  if (!end) {
    return null;
  }
  return new Date(end.getTime() + PRO_GRACE_MS);
}

/**
 * True when plan is PRO and the subscription period (plus grace) has not lapsed.
 * Pass `currentPeriodEnd` from `Subscription` when available; if omitted and plan
 * is PRO, treats missing end as active (legacy rows).
 */
export function isProSubscriberPlan(
  plan: UserPlan | null | undefined,
  currentPeriodEnd?: Date | string | null,
): boolean {
  if (plan !== "PRO") {
    return false;
  }
  const graceEnds = proAccessGraceEndsAt(currentPeriodEnd ?? null);
  if (!graceEnds) {
    return true;
  }
  return Date.now() < graceEnds.getTime();
}

export function isProExpiredPastGrace(
  currentPeriodEnd: Date | string | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const graceEnds = proAccessGraceEndsAt(currentPeriodEnd);
  if (!graceEnds) {
    return false;
  }
  return nowMs >= graceEnds.getTime();
}

export type MePlanPayload = {
  plan?: UserPlan;
  subscription?: { currentPeriodEnd?: string | null } | null;
};

export function planFromMeResponse(payload: MePlanPayload | null): UserPlan | null {
  if (!payload?.plan) {
    return null;
  }
  const periodEnd = payload.subscription?.currentPeriodEnd ?? null;
  return isProSubscriberPlan(payload.plan, periodEnd) ? "PRO" : "FREE";
}

export function isProFromMeResponse(payload: MePlanPayload | null): boolean {
  if (!payload?.plan) {
    return false;
  }
  return isProSubscriberPlan(
    payload.plan,
    payload.subscription?.currentPeriodEnd ?? null,
  );
}
