import { getAuthenticatedUser } from "@/lib/auth";
import { isProSubscriberPlan } from "@/services/billing/userPlan";
import { redirect } from "next/navigation";

/** Redirects signed-out users to sign-in and free users to pricing. */
export async function requireProSubscriber() {
  const user = await getAuthenticatedUser();

  if (!user) {
    redirect("/sign-in");
  }

  if (!isProSubscriberPlan(user.plan)) {
    redirect("/pricing");
  }

  return user;
}
