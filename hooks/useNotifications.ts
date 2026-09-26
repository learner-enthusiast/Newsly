"use client";

import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";
import { useCallback, useEffect, useRef, useState } from "react";

const NOTIFICATION_LIST_LIMIT = 25;
const POLL_INTERVAL_MS = 10_000;

type NotificationsState = {
  notifications: SerializedNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
};

const EMPTY_NOTIFICATIONS_STATE: NotificationsState = {
  notifications: [],
  unreadCount: 0,
  loading: false,
  error: null,
};

type NotificationsPayload = {
  notifications: SerializedNotification[];
  unreadCount: number;
};

type MarkReadResponse = {
  success: boolean;
  notification: SerializedNotification;
  unreadCount: number;
};

async function fetchNotificationsFromApi(): Promise<NotificationsPayload> {
  const response = await fetch(
    `/api/notifications?limit=${NOTIFICATION_LIST_LIMIT}`,
    { cache: "no-store" },
  );

  if (!response.ok) {
    throw new Error("Could not load notifications");
  }

  return (await response.json()) as NotificationsPayload;
}

export function useNotifications(enabled: boolean) {
  const [state, setState] = useState<NotificationsState>({
    notifications: [],
    unreadCount: 0,
    loading: enabled,
    error: null,
  });

  const fetchingRef = useRef(false);
  const hasLoadedRef = useRef(false);

  const applyFetchedNotifications = useCallback((data: NotificationsPayload) => {
    hasLoadedRef.current = true;
    setState({
      notifications: data.notifications,
      unreadCount: data.unreadCount,
      loading: false,
      error: null,
    });
  }, []);

  const refresh = useCallback(async (options?: { silent?: boolean }) => {
    if (!enabled || fetchingRef.current) {
      return;
    }

    fetchingRef.current = true;
    const silent = options?.silent ?? hasLoadedRef.current;

    if (!silent) {
      setState((previous) => ({ ...previous, loading: true, error: null }));
    }

    try {
      const data = await fetchNotificationsFromApi();
      applyFetchedNotifications(data);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Could not load notifications";
      setState((previous) => ({
        ...previous,
        loading: false,
        error: message,
      }));
    } finally {
      fetchingRef.current = false;
    }
  }, [enabled, applyFetchedNotifications]);

  useEffect(() => {
    if (!enabled) {
      hasLoadedRef.current = false;
      return;
    }

    let cancelled = false;

    async function loadInitialNotifications() {
      if (fetchingRef.current) {
        return;
      }

      fetchingRef.current = true;

      try {
        const data = await fetchNotificationsFromApi();
        if (cancelled) {
          return;
        }
        applyFetchedNotifications(data);
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message =
          error instanceof Error
            ? error.message
            : "Could not load notifications";
        setState((previous) => ({
          ...previous,
          loading: false,
          error: message,
        }));
      } finally {
        fetchingRef.current = false;
      }
    }

    void loadInitialNotifications();

    const intervalId = window.setInterval(() => {
      void refresh({ silent: true });
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [enabled, applyFetchedNotifications, refresh]);

  const markAsRead = useCallback(
    async (notification: SerializedNotification): Promise<boolean> => {
      const wasUnread = !notification.read;
      let rollbackSnapshot: NotificationsState | null = null;

      setState((current) => {
        rollbackSnapshot = current;
        return {
          ...current,
          notifications: current.notifications.map((item) =>
            item.id === notification.id ? { ...item, read: true } : item,
          ),
          unreadCount: wasUnread
            ? Math.max(0, current.unreadCount - 1)
            : current.unreadCount,
        };
      });

      try {
        const response = await fetch(
          `/api/notifications/${notification.id}/read`,
          { method: "PATCH" },
        );

        if (!response.ok) {
          throw new Error("Could not mark notification read");
        }

        const data = (await response.json()) as MarkReadResponse;
        setState((current) => ({
          ...current,
          notifications: current.notifications.map((item) =>
            item.id === data.notification.id ? data.notification : item,
          ),
          unreadCount: data.unreadCount,
        }));
        return true;
      } catch {
        if (rollbackSnapshot) {
          setState(rollbackSnapshot);
        }
        void refresh({ silent: true });
        return false;
      }
    },
    [refresh],
  );

  return {
    ...(enabled ? state : EMPTY_NOTIFICATIONS_STATE),
    refresh,
    markAsRead,
  };
}

export function formatNotificationBadgeCount(unreadCount: number): string {
  if (unreadCount > 99) {
    return "99+";
  }
  return String(unreadCount);
}
