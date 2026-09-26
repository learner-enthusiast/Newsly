import { NextResponse } from "next/server";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  deleteNotificationForUser,
  getNotificationByIdForUser,
  patchNotification,
  putNotification,
} from "@/repositories/notification";
import {
  notificationPatchBodySchema,
  notificationPutBodySchema,
  serializeNotification,
} from "@/services/notifications/notificationApiSchemas";

type RouteContext = {
  params: Promise<{ notificationId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;

  try {
    const row = await getNotificationByIdForUser(notificationId, user.id);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(serializeNotification(row));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = notificationPutBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  try {
    const existing = await getNotificationByIdForUser(notificationId, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = await putNotification(existing.id, parsed.data);
    return NextResponse.json(serializeNotification(row));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = notificationPatchBodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request body", details: parsed.error.flatten() },
      { status: 400 },
    );
  }

  if (Object.keys(parsed.data).length === 0) {
    return NextResponse.json(
      { error: "Request body must include at least one field" },
      { status: 400 },
    );
  }

  try {
    const existing = await getNotificationByIdForUser(notificationId, user.id);
    if (!existing) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const row = await patchNotification(existing.id, parsed.data);
    return NextResponse.json(serializeNotification(row));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const user = await requireAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { notificationId } = await context.params;

  try {
    const row = await deleteNotificationForUser(notificationId, user.id);
    if (!row) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json(serializeNotification(row));
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete notification";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
