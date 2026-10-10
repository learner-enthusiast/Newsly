"use client";

import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";
import {
  encodeNotificationCursor,
  mergeNotificationsById,
  NOTIFICATION_PAGE_SIZE,
  type NotificationListCursor,
  type NotificationsPageResponse,
} from "@/services/notifications/notificationPagination";
import { useCallback, useEffect, useRef, useState } from "react";

type UseNotificationPagesResult = {
  notifications: SerializedNotification[];
  unreadCount: number;
  loadingInitial: boolean;
  loadingOlder: boolean;
  hasMoreOlder: boolean;
  olderError: string | null;
  loadOlderNotifications: () => Promise<void>;
  retryLoadOlder: () => Promise<void>;
  refreshLatestPage: () => Promise<NotificationsPageResponse | null>;
  replaceNotification: (notification: SerializedNotification) => void;
  applyLocalReadState: (notificationId: string, read: boolean) => void;
  syncUnreadCount: (count: number) => void;
};

async function fetchNotificationsPage(
  options: { before?: string | null; limit?: number },
  signal?: AbortSignal,
): Promise<NotificationsPageResponse> {
  const params = new URLSearchParams({
    limit: String(options.limit ?? NOTIFICATION_PAGE_SIZE),
  });
  if (options.before) {
    params.set("before", options.before);
  }

  const response = await fetch(`/api/notifications?${params.toString()}`, {
    cache: "no-store",
    signal,
  });

  let payload: NotificationsPageResponse & { error?: string };
  try {
    payload = (await response.json()) as NotificationsPageResponse & {
      error?: string;
    };
  } catch {
    throw new Error("Could not load notifications");
  }

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not load notifications");
  }
  if (!Array.isArray(payload.notifications)) {
    throw new Error("Could not load notifications");
  }

  return payload;
}

export function useNotificationPages(
  enabled: boolean,
): UseNotificationPagesResult {
  const [notifications, setNotifications] = useState<SerializedNotification[]>(
    [],
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const [loadingInitial, setLoadingInitial] = useState(enabled);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [olderError, setOlderError] = useState<string | null>(null);
  const nextOlderCursorRef = useRef<NotificationListCursor | null>(null);
  const loadOlderInFlightRef = useRef(false);

  const applyFirstPage = useCallback((page: NotificationsPageResponse) => {
    nextOlderCursorRef.current = page.nextCursor;
    setNotifications(page.notifications);
    setHasMoreOlder(page.hasMore);
    setUnreadCount(page.unreadCount);
    setLoadingInitial(false);
    setLoadingOlder(false);
    setOlderError(null);
  }, []);

  useEffect(() => {
    if (!enabled) {
      setNotifications([]);
      setUnreadCount(0);
      setLoadingInitial(false);
      setHasMoreOlder(false);
      setOlderError(null);
      nextOlderCursorRef.current = null;
      return;
    }

    const abort = new AbortController();
    setLoadingInitial(true);
    setOlderError(null);
    nextOlderCursorRef.current = null;

    void fetchNotificationsPage({}, abort.signal)
      .then((page) => {
        if (abort.signal.aborted) {
          return;
        }
        applyFirstPage(page);
      })
      .catch((error: unknown) => {
        if (abort.signal.aborted) {
          return;
        }
        setNotifications([]);
        setHasMoreOlder(false);
        setLoadingInitial(false);
        setOlderError(
          error instanceof Error ? error.message : "Could not load notifications",
        );
      });

    return () => {
      abort.abort();
    };
  }, [enabled, applyFirstPage]);

  const refreshLatestPage = useCallback(async () => {
    if (!enabled) {
      return null;
    }
    try {
      const page = await fetchNotificationsPage({});
      setNotifications((current) =>
        mergeNotificationsById(page.notifications, current),
      );
      setUnreadCount(page.unreadCount);
      if (nextOlderCursorRef.current === null && page.nextCursor) {
        nextOlderCursorRef.current = page.nextCursor;
        setHasMoreOlder(page.hasMore);
      }
      return page;
    } catch {
      return null;
    }
  }, [enabled]);

  const loadOlderNotifications = useCallback(
    async (options?: { force?: boolean }) => {
      if (!enabled || (loadOlderInFlightRef.current && !options?.force)) {
        return;
      }

      const cursor = nextOlderCursorRef.current;
      if (!cursor) {
        if (options?.force) {
          setOlderError("Nothing older to load.");
        }
        return;
      }

      loadOlderInFlightRef.current = true;
      setLoadingOlder(true);
      setOlderError(null);

      try {
        const page = await fetchNotificationsPage({
          before: encodeNotificationCursor(cursor),
        });
        nextOlderCursorRef.current = page.nextCursor;
        setNotifications((current) =>
          mergeNotificationsById(current, page.notifications),
        );
        setHasMoreOlder(page.hasMore);
        setUnreadCount(page.unreadCount);
      } catch (error) {
        setOlderError(
          error instanceof Error
            ? error.message
            : "Could not load older notifications",
        );
      } finally {
        loadOlderInFlightRef.current = false;
        setLoadingOlder(false);
      }
    },
    [enabled],
  );

  const retryLoadOlder = useCallback(async () => {
    await loadOlderNotifications({ force: true });
  }, [loadOlderNotifications]);

  const replaceNotification = useCallback(
    (notification: SerializedNotification) => {
      setNotifications((current) =>
        current.map((item) =>
          item.id === notification.id ? notification : item,
        ),
      );
    },
    [],
  );

  const applyLocalReadState = useCallback(
    (notificationId: string, read: boolean) => {
      setNotifications((current) => {
        const existing = current.find((item) => item.id === notificationId);
        if (existing && existing.read !== read) {
          if (read) {
            setUnreadCount((count) => Math.max(0, count - 1));
          } else {
            setUnreadCount((count) => count + 1);
          }
        }
        return current.map((item) =>
          item.id === notificationId ? { ...item, read } : item,
        );
      });
    },
    [],
  );

  const syncUnreadCount = useCallback((count: number) => {
    setUnreadCount(count);
  }, []);

  return {
    notifications,
    unreadCount,
    loadingInitial,
    loadingOlder,
    hasMoreOlder,
    olderError,
    loadOlderNotifications: () => loadOlderNotifications(),
    retryLoadOlder,
    refreshLatestPage,
    replaceNotification,
    applyLocalReadState,
    syncUnreadCount,
  };
}
