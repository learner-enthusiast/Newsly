import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  getNewsRequestResult,
  retryFailedNewsRequest,
} from "@/services/news/apiService";

type RouteContext = {
  params: Promise<{ newsId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { newsId } = await context.params;
  const result = await getNewsRequestResult(user.id, newsId);

  if (!result) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(result);
}

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { newsId } = await context.params;
  const result = await retryFailedNewsRequest(user.id, newsId);

  if (!result) {
    return NextResponse.json(
      { error: "Not found or request is not failed" },
      { status: 404 },
    );
  }

  return NextResponse.json(result);
}
