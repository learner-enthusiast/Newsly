import {
  listPlansByUserId,
  type PlanListRecord,
} from "@/repositories/plan";

export type UserPlanListItem = {
  id: string;
  slug: string;
  title: string;
  description: string | null;
  festivalName: string;
  city: string;
  country: string;
  year: number;
  status: PlanListRecord["status"];
  visibility: PlanListRecord["visibility"];
  createdAt: string;
  updatedAt: string;
};

function toListItem(plan: PlanListRecord): UserPlanListItem {
  return {
    id: plan.id,
    slug: plan.slug,
    title: plan.title,
    description: plan.description,
    festivalName: plan.festivalName,
    city: plan.city,
    country: plan.country,
    year: plan.year,
    status: plan.status,
    visibility: plan.visibility,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export async function listUserPlans(userId: string): Promise<UserPlanListItem[]> {
  const plans = await listPlansByUserId(userId);
  return plans.map(toListItem);
}
