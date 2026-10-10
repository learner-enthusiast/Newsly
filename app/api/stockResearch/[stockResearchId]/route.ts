import { NextResponse } from "next/server";
import { requireProApiUser } from "@/lib/requireProApiUser";
import { getStockResearchDetail } from "@/services/stockResearch/apiService";

type RouteContext = {
  params: Promise<{ stockResearchId: string }>;
};

/** One research with status, loading logs, report Markdown and source list. */
export async function GET(_request: Request, context: RouteContext) {
  const { user, response } = await requireProApiUser();
  if (!user) {
    return response;
  }

  const { stockResearchId } = await context.params;
  const result = await getStockResearchDetail(user.id, stockResearchId);
  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}
