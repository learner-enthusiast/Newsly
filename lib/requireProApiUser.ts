import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { isProSubscriberPlan } from "@/services/billing/userPlanAccess";

type ProApiUserResult =
  | { user: NonNullable<Awaited<ReturnType<typeof requireAuthenticatedUser>>>; response: null }
  | { user: null; response: NextResponse };

/** API-route counterpart of `requireProSubscriber`: 401 signed out, 403 free plan. */
export async function requireProApiUser(): Promise<ProApiUserResult> {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return {
      user: null,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (
    !isProSubscriberPlan(user.plan, user.subscription?.currentPeriodEnd ?? null)
  ) {
    return {
      user: null,
      response: NextResponse.json(
        { error: "A Pro subscription is required" },
        { status: 403 },
      ),
    };
  }
  return { user, response: null };
}
