import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  countUnreadNotificationsForUser,
  createNotification,
  listNotificationsCursorPage,
} from "@/repositories/notification";
import {
  notificationCreateBodySchema,
  notificationListQuerySchema,
  serializeNotification,
} from "@/services/notifications/notificationApiSchemas";
import {
  decodeNotificationCursor,
  type NotificationListCursor,
} from "@/services/notifications/notificationPagination";

export async function GET(request: Request) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = notificationListQuerySchema.safeParse({
    read: searchParams.get("read") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
    before: searchParams.get("before") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid query parameters" },
      { status: 400 },
    );
  }

  try {
    let beforeCursor: NotificationListCursor | undefined;
    if (parsed.data.before) {
      const decoded = decodeNotificationCursor(parsed.data.before);
      if (!decoded) {
        return NextResponse.json(
          { error: "Invalid before cursor" },
          { status: 400 },
        );
      }
      beforeCursor = decoded;
    }

    const [page, unreadCount] = await Promise.all([
      listNotificationsCursorPage({
        userId: user.id,
        read: parsed.data.read,
        limit: parsed.data.limit,
        before: beforeCursor
          ? {
              createdAt: new Date(beforeCursor.createdAt),
              id: beforeCursor.id,
            }
          : undefined,
      }),
      countUnreadNotificationsForUser(user.id),
    ]);

    return NextResponse.json({
      notifications: page.notifications.map(serializeNotification),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor
        ? {
            createdAt: page.nextCursor.createdAt.toISOString(),
            id: page.nextCursor.id,
          }
        : null,
      unreadCount,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load notifications";
    return NextResponse.json({ error: message }, { status: 500 });
  }
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

  const parsed = notificationCreateBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const row = await createNotification({
      userId: user.id,
      ...parsed.data,
    });
    return NextResponse.json(serializeNotification(row), { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
