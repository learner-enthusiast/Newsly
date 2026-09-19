import { getPlanDaysByPlanId } from "@/repositories/planDay";
import { getPlanItemsByDayId } from "@/repositories/planItem";

export async function getPlanPagePayload(plan: {
  id: string;
  slug: string;
  status: string;
  title: string;
  festivalName: string;
  city: string;
  country: string;
  year: number;
  requestData: unknown;
  weather: unknown;
}) {
  const days = await getPlanDaysByPlanId(plan.id);
  const daysWithItems = await Promise.all(
    days.map(async (day) => ({
      ...day,
      items: await getPlanItemsByDayId(day.id),
    })),
  );

  return {
    id: plan.id,
    slug: plan.slug,
    status: plan.status,
    title: plan.title,
    festivalName: plan.festivalName,
    city: plan.city,
    country: plan.country,
    year: plan.year,
    requestData: plan.requestData,
    weather: plan.weather,
    days: daysWithItems,
  };
}
