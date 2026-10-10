import { z } from "zod";
import { prisma } from "@/db";

const notificationIdSchema = z.uuid("id must be a uuid");
const userIdSchema = z.string().min(1, "userId is required");

const notificationWriteSchema = z.object({
  userId: userIdSchema,
  type: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  message: z.string().min(1).max(4000).nullable().optional(),
  link: z.string().min(1).max(2000).nullable().optional(),
  read: z.boolean().optional(),
  dedupeKey: z.string().min(1).max(200).nullable().optional(),
});

const notificationPutSchema = notificationWriteSchema.omit({ userId: true });
const notificationPatchSchema = notificationPutSchema.partial();

export type NotificationCreateInput = z.input<typeof notificationWriteSchema>;
export type NotificationPutInput = z.input<typeof notificationPutSchema>;
export type NotificationPatchInput = z.input<typeof notificationPatchSchema>;

export async function createNotification(input: NotificationCreateInput) {
  return prisma.notification.create({
    data: notificationWriteSchema.parse(input),
  });
}

export async function getNotificationById(id: string) {
  return prisma.notification.findUnique({
    where: { id: notificationIdSchema.parse(id) },
  });
}

export async function getNotificationByIdForUser(id: string, userId: string) {
  return prisma.notification.findFirst({
    where: {
      id: notificationIdSchema.parse(id),
      userId: userIdSchema.parse(userId),
    },
  });
}

export type NotificationCursorInput = {
  createdAt: Date;
  id: string;
};

export async function listNotificationsByUserId(
  userId: string,
  options?: {
    read?: boolean;
    limit?: number;
  },
) {
  const page = await listNotificationsCursorPage({
    userId,
    read: options?.read,
    limit: options?.limit ?? 50,
  });
  return page.notifications;
}

export async function listNotificationsCursorPage(input: {
  userId: string;
  read?: boolean;
  limit: number;
  before?: NotificationCursorInput;
}) {
  const parsedUserId = userIdSchema.parse(input.userId);
  const take = Math.min(Math.max(1, input.limit), 100);

  const rows = await prisma.notification.findMany({
    where: {
      userId: parsedUserId,
      ...(input.read === undefined ? {} : { read: input.read }),
      ...(input.before
        ? { createdAt: { lte: input.before.createdAt } }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: take + 2,
  });

  const before = input.before;
  const olderThanCursor = before
    ? rows.filter((row) => {
        const timeDiff =
          row.createdAt.getTime() - before.createdAt.getTime();
        if (timeDiff !== 0) {
          return timeDiff < 0;
        }
        return row.id < before.id;
      })
    : rows;

  const hasMore = olderThanCursor.length > take;
  const pageDesc = hasMore ? olderThanCursor.slice(0, take) : olderThanCursor;
  const notifications = pageDesc;
  const oldest = notifications.at(-1);

  return {
    notifications,
    hasMore,
    nextCursor:
      hasMore && oldest
        ? { createdAt: oldest.createdAt, id: oldest.id }
        : null,
  };
}

export async function countUnreadNotificationsForUser(userId: string) {
  return prisma.notification.count({
    where: {
      userId: userIdSchema.parse(userId),
      read: false,
    },
  });
}

export async function putNotification(id: string, input: NotificationPutInput) {
  return prisma.notification.update({
    where: { id: notificationIdSchema.parse(id) },
    data: notificationPutSchema.parse(input),
  });
}

export async function patchNotification(
  id: string,
  input: NotificationPatchInput,
) {
  return prisma.notification.update({
    where: { id: notificationIdSchema.parse(id) },
    data: notificationPatchSchema.parse(input),
  });
}

export async function markNotificationReadForUser(
  id: string,
  userId: string,
) {
  const row = await getNotificationByIdForUser(id, userId);
  if (!row) {
    return null;
  }
  if (row.read) {
    return row;
  }
  return prisma.notification.update({
    where: { id: row.id },
    data: { read: true },
  });
}

export async function markAllNotificationsReadForUser(userId: string) {
  const parsedUserId = userIdSchema.parse(userId);
  const result = await prisma.notification.updateMany({
    where: { userId: parsedUserId, read: false },
    data: { read: true },
  });
  return result.count;
}

export async function deleteNotification(id: string) {
  return prisma.notification.delete({
    where: { id: notificationIdSchema.parse(id) },
  });
}

export async function deleteNotificationForUser(id: string, userId: string) {
  const row = await getNotificationByIdForUser(id, userId);
  if (!row) {
    return null;
  }
  return prisma.notification.delete({
    where: { id: row.id },
  });
}
