import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getPotentialStoryTopicsPageForChatSession } from "@/services/chat/potentialStoryTopicsService";

type RouteContext = {
  params: Promise<{ chatSessionId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;
  const { searchParams } = new URL(request.url);

  try {
    const result = await getPotentialStoryTopicsPageForChatSession(
      user.id,
      chatSessionId,
      {
        limit: searchParams.has("limit")
          ? Number(searchParams.get("limit"))
          : undefined,
        offset: searchParams.has("offset")
          ? Number(searchParams.get("offset"))
          : undefined,
      },
    );
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to load potential story topics";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
