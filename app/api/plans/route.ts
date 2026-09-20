import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { listUserPlans } from "@/services/plans/listUserPlans";

export async function GET() {
  const user = await getAuthenticatedUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const plans = await listUserPlans(user.id);

  return NextResponse.json({ plans });
}
