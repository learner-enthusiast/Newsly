import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  countUnreadNotificationsForUser,
  markNotificationReadForUser,
} from "@/repositories/notification";
import { serializeNotification } from "@/services/notifications/notificationApiSchemas";

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

async function markReadForAuthenticatedUser(
  notificationId: string,
  userId: string,
) {
  const row = await markNotificationReadForUser(notificationId, userId);
  if (!row) {
    return null;
  }
  const unreadCount = await countUnreadNotificationsForUser(userId);
  return {
    success: true as const,
    notification: serializeNotification(row),
    unreadCount,
  };
}

export async function PATCH(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;

  try {
    const result = await markReadForAuthenticatedUser(notificationId, user.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to mark notification read";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;

  try {
    const result = await markReadForAuthenticatedUser(notificationId, user.id);
    if (!result) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to mark notification read";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
