import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  createChatSessionForUser,
  listChatSessionsForUser,
} from "@/services/chat/chatSessionCrud";

export async function GET() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sessions = await listChatSessionsForUser(user.id);
  return NextResponse.json({ sessions });
}

export async function POST() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await createChatSessionForUser(user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create chat session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
