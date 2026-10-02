import { prisma } from "@/db";
import type { UserPlan } from "@/db/generated/client";

export type { UserPlan };

export {
  isProExpiredPastGrace,
  isProFromMeResponse,
  isProSubscriberPlan,
  planFromMeResponse,
  proAccessGraceEndsAt,
  PRO_SUBSCRIPTION_GRACE_DAYS,
  type MePlanPayload,
} from "@/services/billing/userPlanAccess";

import {
  isProExpiredPastGrace,
  PRO_SUBSCRIPTION_GRACE_DAYS,
} from "@/services/billing/userPlanAccess";

/**
 * If Pro period ended more than {@link PRO_SUBSCRIPTION_GRACE_DAYS} ago, set
 * `User.plan` to FREE and mark subscription EXPIRED. Returns effective plan.
 */
export async function reconcileExpiredProSubscription(
  userId: string,
): Promise<UserPlan> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      plan: true,
      subscription: {
        select: { id: true, currentPeriodEnd: true, status: true },
      },
    },
  });

  if (!user || user.plan !== "PRO") {
    return user?.plan ?? "FREE";
  }

  const periodEnd = user.subscription?.currentPeriodEnd ?? null;
  if (!isProExpiredPastGrace(periodEnd)) {
    return "PRO";
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { plan: "FREE" },
    });
    if (user.subscription) {
      await tx.subscription.update({
        where: { id: user.subscription.id },
        data: { status: "EXPIRED", plan: "FREE" },
      });
    }
  });

  return "FREE";
}
