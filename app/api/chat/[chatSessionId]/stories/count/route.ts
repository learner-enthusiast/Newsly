import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { countUserCreatedStoriesForChatSession } from "@/services/news/chatSessionStoriesService";

type RouteContext = {
  params: Promise<{ chatSessionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;

  try {
    const result = await countUserCreatedStoriesForChatSession({
      userId: user.id,
      chatSessionId,
    });
    if (!result) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load story count";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
