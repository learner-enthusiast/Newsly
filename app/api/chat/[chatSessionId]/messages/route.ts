import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { CHAT_MESSAGES_PAGE_SIZE } from "@/services/chat/chatMessagePagination";
import { getChatMessagesPageForUser } from "@/services/chat/chatMessagesPageService";
import { z } from "zod";

type RouteContext = {
  params: Promise<{ chatSessionId: string }>;
};

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  before: z.string().min(1).optional(),
});

export async function GET(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { chatSessionId } = await context.params;
  const url = new URL(request.url);
  const parsedQuery = querySchema.safeParse({
    limit: url.searchParams.get("limit") ?? undefined,
    before: url.searchParams.get("before") ?? undefined,
  });

  if (!parsedQuery.success) {
    return NextResponse.json({ error: "Invalid query" }, { status: 400 });
  }

  try {
    const result = await getChatMessagesPageForUser({
      userId: user.id,
      chatSessionId,
      limit: parsedQuery.data.limit ?? CHAT_MESSAGES_PAGE_SIZE,
      before: parsedQuery.data.before ?? null,
    });

    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load messages";
    const status = message === "Invalid cursor" ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
