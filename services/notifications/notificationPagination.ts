import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";

export const NOTIFICATION_PAGE_SIZE = 20;

export const NOTIFICATION_LOAD_MORE_SCROLL_THRESHOLD_PX = 120;

export type NotificationListCursor = {
  createdAt: string;
  id: string;
};

export type NotificationsPageResponse = {
  notifications: SerializedNotification[];
  nextCursor: NotificationListCursor | null;
  hasMore: boolean;
  unreadCount: number;
};

const CURSOR_SEPARATOR = "~";

function isUsableCursor(value: {
  createdAt: string;
  id: string;
}): boolean {
  return (
    value.createdAt.length > 0 &&
    value.id.length > 0 &&
    !Number.isNaN(Date.parse(value.createdAt))
  );
}

export function encodeNotificationCursor(cursor: NotificationListCursor): string {
  return `${cursor.createdAt}${CURSOR_SEPARATOR}${cursor.id}`;
}

export function decodeNotificationCursor(
  raw: string,
): NotificationListCursor | null {
  const value = raw.trim();
  if (!value) {
    return null;
  }

  const separatorIndex = value.lastIndexOf(CURSOR_SEPARATOR);
  if (separatorIndex > 0 && separatorIndex < value.length - 1) {
    const cursor = {
      createdAt: value.slice(0, separatorIndex),
      id: value.slice(separatorIndex + 1),
    };
    if (isUsableCursor(cursor)) {
      return cursor;
    }
  }

  return null;
}

export function compareNotificationsNewestFirst(
  a: SerializedNotification,
  b: SerializedNotification,
): number {
  const timeDiff =
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (timeDiff !== 0) {
    return timeDiff;
  }
  return b.id.localeCompare(a.id);
}

export function mergeNotificationsById(
  ...groups: SerializedNotification[][]
): SerializedNotification[] {
  const byId = new Map<string, SerializedNotification>();
  for (const group of groups) {
    for (const notification of group) {
      byId.set(notification.id, notification);
    }
  }
  return [...byId.values()].sort(compareNotificationsNewestFirst);
}
