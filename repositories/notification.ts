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

export async function listNotificationsByUserId(
  userId: string,
  options?: {
    read?: boolean;
    limit?: number;
  },
) {
  const parsedUserId = userIdSchema.parse(userId);
  const limit = Math.min(Math.max(1, options?.limit ?? 50), 100);

  return prisma.notification.findMany({
    where: {
      userId: parsedUserId,
      ...(options?.read === undefined ? {} : { read: options.read }),
    },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
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
