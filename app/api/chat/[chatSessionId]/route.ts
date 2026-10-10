import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  deleteChatSessionForUser,
  patchChatSessionBodySchema,
  patchChatSessionForUser,
} from "@/services/chat/chatSessionCrud";
import {
  sendChatMessage,
  sendChatMessageBodySchema,
} from "@/services/chat/sendChatMessage";

type RouteContext = {
  params: Promise<{ chatSessionId: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = patchChatSessionBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.flatten().formErrors.join("; ") ||
          parsed.error.flatten().fieldErrors.title?.join("; ") ||
          "Invalid body",
      },
      { status: 400 },
    );
  }

  try {
    const result = await patchChatSessionForUser({
      userId: user.id,
      chatSessionId,
      title: parsed.data.title,
      isBookmarked: parsed.data.isBookmarked,
    });
    if (!result) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to rename chat";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;

  try {
    const result = await deleteChatSessionForUser({
      userId: user.id,
      chatSessionId,
    });
    if (!result) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete chat";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = sendChatMessageBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.flatten().formErrors.join("; ") || "Invalid message body",
      },
      { status: 400 },
    );
  }

  try {
    const result = await sendChatMessage({
      userId: user.id,
      chatSessionId,
      content: parsed.data.content,
      shouldCreateStory: parsed.data.shouldCreateStory,
    });

    if (!result) {
      return NextResponse.json({ error: "Chat session not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to send message";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
