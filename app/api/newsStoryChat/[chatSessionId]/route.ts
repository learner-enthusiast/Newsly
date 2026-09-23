import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getNewsStoryChatState } from "@/services/chat/newsStoryChatService";

type RouteContext = {
  params: Promise<{ chatSessionId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;
  const state = await getNewsStoryChatState(user.id, chatSessionId);

  if (!state) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json(state);
}
