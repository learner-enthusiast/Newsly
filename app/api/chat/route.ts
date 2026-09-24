import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { createGeneralChatSession } from "@/services/chat/createGeneralChatSession";

export async function POST() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await createGeneralChatSession(user.id);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create chat session";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
