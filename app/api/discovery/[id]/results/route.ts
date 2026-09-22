import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { discoveryResultsService } from "@/services/news/discovery-results.service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const results = await discoveryResultsService.getResultsForUser(id, user.id);

  if (!results) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (results.discoveryRun.status !== "COMPLETED") {
    return NextResponse.json(
      {
        error: "Results not ready",
        discoveryRun: results.discoveryRun,
      },
      { status: 409 },
    );
  }

  return NextResponse.json(results);
}
