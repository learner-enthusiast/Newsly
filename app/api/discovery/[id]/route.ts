import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { serializeDiscoveryRun } from "@/lib/discovery-run-serializer";
import { discoveryService } from "@/services/news/discovery.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const run = await discoveryService.getDiscoveryRunForUser(id, user.id);

  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(serializeDiscoveryRun(run));
}
