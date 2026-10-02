import type { UserPlan } from "@/db/generated/client";

export type { UserPlan };

/** True when the user row grants Pro access (same check as checkout gating). */
export function isProSubscriberPlan(
  plan: UserPlan | null | undefined,
): boolean {
  return plan === "PRO";
}

export type MePlanPayload = {
  plan?: UserPlan;
};

export function planFromMeResponse(payload: MePlanPayload | null): UserPlan | null {
  if (!payload?.plan) {
    return null;
  }
  return payload.plan;
}
