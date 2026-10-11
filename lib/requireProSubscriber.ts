import { getAuthenticatedUser } from "@/lib/auth";
import { isProSubscriberPlan } from "@/services/billing/userPlanAccess";
import { redirectToSignInModal } from "@/lib/redirectToSignInModal";
import { redirect } from "next/navigation";

/** Sends signed-out users to the sign-in modal and free users to pricing. */
export async function requireProSubscriber() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return redirectToSignInModal();
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
