import { getAuthenticatedUser } from "@/lib/auth";
import { isProSubscriberPlan } from "@/services/billing/userPlanAccess";
import { redirect } from "next/navigation";

/** Redirects signed-out users to sign-in and free users to pricing. */
export async function requireProSubscriber() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (
    !isProSubscriberPlan(
      user.plan,
      user.subscription?.currentPeriodEnd ?? null,
    )
  ) {
    redirect("/pricing");
  }

  return user;
}
