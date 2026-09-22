import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { discoveryResultsService } from "@/services/news/discovery-results.service";
import { discoveryService } from "@/services/news/discovery.service";

type RouteContext = {
  params: Promise<{ id: string; eventId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id, eventId } = await context.params;
  const run = await discoveryService.getDiscoveryRunForUser(id, user.id);
  if (!run) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (run.status !== "COMPLETED") {
    return NextResponse.json({ error: "Results not ready" }, { status: 409 });
  }

  const detail = await discoveryResultsService.getStoryDetailForUser(
    id,
    eventId,
    user.id,
  );

  if (!detail) {
    return NextResponse.json({ error: "Story not found" }, { status: 404 });
  }

  return NextResponse.json(detail);
}
