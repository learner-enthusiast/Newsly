import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthenticatedUser } from "@/lib/auth";
import {
  getDayEditorPayload,
  saveDayItemOrder,
} from "@/services/plans/dayEditor";

type RouteContext = {
  params: Promise<{ planId: string; dayId: string }>;
};

const saveBodySchema = z.object({
  itemOrder: z.array(z.string().min(1)),
});

export async function GET(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId, dayId } = await context.params;
  const payload = await getDayEditorPayload(planId, dayId, user.id);

  if (!payload) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(payload);
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId, dayId } = await context.params;

  let body: z.infer<typeof saveBodySchema>;

  try {
    body = saveBodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const items = await saveDayItemOrder(
      planId,
      dayId,
      user.id,
      body.itemOrder,
    );

    if (!items) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ items });
  } catch {
    return NextResponse.json({ error: "Could not save item order" }, { status: 400 });
  }
}
