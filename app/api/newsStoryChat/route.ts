import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  listUserChatSessionsForUi,
  newsStoryChatBodySchema,
  startNewsStoryChat,
} from "@/services/chat/newsStoryChatService";

export async function GET() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await listUserChatSessionsForUi(user.id);
  return NextResponse.json({ sessions });
}

export async function POST(request: Request) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = newsStoryChatBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.flatten().formErrors.join("; ") || "Invalid body" },
      { status: 400 },
    );
  }

  try {
    const result = await startNewsStoryChat({
      userId: user.id,
      newsStoryId: parsed.data.newsStoryId,
      researchRequest: parsed.data.researchRequest,
    });

    if (!result) {
      return NextResponse.json({ error: "News story not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to start chat";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
