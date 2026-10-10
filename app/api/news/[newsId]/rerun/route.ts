import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { startNewsRequestRerun } from "@/services/news/apiService";

type RouteContext = {
  params: Promise<{ newsId: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { newsId } = await context.params;
  const result = await startNewsRequestRerun(user.id, newsId);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if ("error" in result) {
    if (result.error === "already_rerunning") {
      return NextResponse.json(
        { error: "A refresh is already in progress." },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { error: "Briefing must be completed before refreshing." },
      { status: 400 },
    );
  }

  return NextResponse.json(result);
}
