"use client";

import { useNotificationPages } from "@/hooks/useNotificationPages";
import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";
import { useCallback, useEffect } from "react";

const POLL_INTERVAL_MS = 10_000;

type MarkReadResponse = {
  success: boolean;
  notification: SerializedNotification;
  unreadCount: number;
};

export function useNotifications(enabled: boolean) {
  const pages = useNotificationPages(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }
    await pages.refreshLatestPage();
  }, [enabled, pages.refreshLatestPage]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = window.setInterval(() => {
      void pages.refreshLatestPage();
    }, POLL_INTERVAL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [enabled, pages.refreshLatestPage]);

  const markAsRead = useCallback(
    async (notification: SerializedNotification): Promise<boolean> => {
      const wasUnread = !notification.read;
      if (wasUnread) {
        pages.applyLocalReadState(notification.id, true);
      }

      try {
        const response = await fetch(
          `/api/notifications/${notification.id}/read`,
          { method: "PATCH" },
        );

        if (!response.ok) {
          throw new Error("Could not mark notification read");
        }

        const data = (await response.json()) as MarkReadResponse;
        pages.replaceNotification(data.notification);
        pages.syncUnreadCount(data.unreadCount);
        return true;
      } catch {
        if (wasUnread) {
          pages.applyLocalReadState(notification.id, false);
        }
        void pages.refreshLatestPage();
        return false;
      }
    },
    [
      pages.applyLocalReadState,
      pages.replaceNotification,
      pages.syncUnreadCount,
      pages.refreshLatestPage,
    ],
  );

  const listError =
    pages.notifications.length === 0 ? pages.olderError : null;

  return {
    notifications: enabled ? pages.notifications : [],
    unreadCount: enabled ? pages.unreadCount : 0,
    loading: enabled ? pages.loadingInitial : false,
    error: enabled ? listError : null,
    listFooterError: enabled ? pages.olderError : null,
    loadingOlder: enabled ? pages.loadingOlder : false,
    hasMoreOlder: enabled ? pages.hasMoreOlder : false,
    loadOlderNotifications: pages.loadOlderNotifications,
    retryLoadOlder: pages.retryLoadOlder,
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
