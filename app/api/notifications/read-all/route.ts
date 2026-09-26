import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import { markAllNotificationsReadForUser } from "@/repositories/notification";

export async function POST() {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const updatedCount = await markAllNotificationsReadForUser(user.id);
    return NextResponse.json({ updatedCount });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to mark notifications read";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
