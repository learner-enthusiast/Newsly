import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getPlanByUserIdAndSlug } from "@/repositories/plan";
import { getPlanPagePayload } from "@/services/planner/planView";

type RouteContext = {
  params: Promise<{ slug: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { slug } = await context.params;
  const plan = await getPlanByUserIdAndSlug(user.id, slug);

  if (!plan) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(await getPlanPagePayload(plan));
}
