import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import { moveDayItem, removeDayItem } from "@/services/plans/dayEditor";

type RouteContext = {
  params: Promise<{ planId: string; dayId: string; itemId: string }>;
};

const moveBodySchema = z.object({
  targetDayId: z.string().min(1),
});

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId, dayId, itemId } = await context.params;
  const result = await removeDayItem(planId, dayId, itemId, user.id);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId, dayId, itemId } = await context.params;

  let body: z.infer<typeof moveBodySchema>;

  try {
    body = moveBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await moveDayItem(
    planId,
    dayId,
    itemId,
    user.id,
    body.targetDayId,
  );

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
