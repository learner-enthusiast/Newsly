import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { requireOwnedPlanDay } from "@/services/plans/planAccess";
import { searchPlacesForDay } from "@/services/plans/dayEditor";
import type { PlaceCategory } from "@/services/serpService";

type RouteContext = {
  params: Promise<{ planId: string; dayId: string }>;
};

const querySchema = z.object({
  category: z.enum([
    "pandal",
    "food",
    "restaurant",
    "parking",
    "cafe",
    "restroom",
    "atm",
    "pharmacy",
  ]),
  q: z.string().optional(),
});

export async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId, dayId } = await context.params;
  const day = await requireOwnedPlanDay(planId, dayId, user.id);

  if (!day) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    category: url.searchParams.get("category"),
    q: url.searchParams.get("q") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  const places = await searchPlacesForDay({
    city: day.plan.city,
    category: parsed.data.category as PlaceCategory,
    query: parsed.data.q,
    limit: 8,
  });

  return NextResponse.json({ places });
}
