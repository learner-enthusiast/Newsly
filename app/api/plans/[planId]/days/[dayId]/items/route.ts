import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { addDayItemFromPlace } from "@/services/plans/dayEditor";
import type { PlaceCategory } from "@/services/serpService";

type RouteContext = {
  params: Promise<{ planId: string; dayId: string }>;
};

const placeCategorySchema = z.enum([
  "pandal",
  "food",
  "restaurant",
  "parking",
  "cafe",
  "restroom",
  "atm",
  "pharmacy",
]);

const addItemBodySchema = z.object({
  externalId: z.string().min(1),
  name: z.string().min(1),
  address: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  rating: z.number().nullable().optional(),
  reviewCount: z.number().int().nullable().optional(),
  description: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  thumbnail: z.string().nullable().optional(),
  category: placeCategorySchema,
});

export async function POST(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId, dayId } = await context.params;

  let body: z.infer<typeof addItemBodySchema>;

  try {
    body = addItemBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const item = await addDayItemFromPlace(planId, dayId, user.id, {
    ...body,
    category: body.category as PlaceCategory,
  });

  if (!item) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ item });
}
