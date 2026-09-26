import { NextResponse } from "next/server";
import { getAuthenticatedUser } from "@/lib/auth";
import { getNewsStoryPageResult } from "@/services/news/apiService";

type RouteContext = {
  params: Promise<{ storyId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { storyId } = await context.params;
  const viewer = await getAuthenticatedUser();

  try {
    const result = await getNewsStoryPageResult(storyId, viewer?.id ?? null);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load story";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
