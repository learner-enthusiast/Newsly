import { getPlanById } from "@/repositories/plan";
import { getPlanDayById } from "@/repositories/planDay";

export async function requireOwnedPlan(planId: string, userId: string) {
  const plan = await getPlanById(planId);

  if (!plan || plan.userId !== userId) {
    return null;
  }

  return plan;
}

export async function requireOwnedPlanDay(
  planId: string,
  dayId: string,
  userId: string,
) {
  const day = await getPlanDayById(dayId);

  if (!day || day.planId !== planId || day.plan.userId !== userId) {
    return null;
  }

  return day;
}
