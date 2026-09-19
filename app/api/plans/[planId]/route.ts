import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPlanById } from "@/repositories/plan";
import { getPlanPagePayload } from "@/services/planner/planView";

type RouteContext = {
  params: Promise<{ planId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { planId } = await context.params;
  const plan = await getPlanById(planId);

  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (plan.userId !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return NextResponse.json(await getPlanPagePayload(plan));
}
