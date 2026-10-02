import { z } from "zod";

export const notificationCreateBodySchema = z.object({
  type: z.string().min(1).max(80),
  title: z.string().min(1).max(300),
  message: z.string().min(1).max(4000).nullable().optional(),
  link: z.string().min(1).max(2000).nullable().optional(),
  read: z.boolean().optional(),
});

export const notificationPutBodySchema = notificationCreateBodySchema;

export const notificationPatchBodySchema = notificationCreateBodySchema.partial();

export const notificationListQuerySchema = z.object({
  read: z
    .enum(["true", "false"])
    .optional()
    .transform((value) =>
      value === undefined ? undefined : value === "true",
    ),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  before: z.string().min(1).optional(),
});

export type SerializedNotification = {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: string;
};

export function serializeNotification(row: {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string | null;
  link: string | null;
  read: boolean;
  createdAt: Date;
}): SerializedNotification {
  return {
    id: row.id,
    userId: row.userId,
    type: row.type,
    title: row.title,
    message: row.message,
    link: row.link,
    read: row.read,
    createdAt: row.createdAt.toISOString(),
  };
}
