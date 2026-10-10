"use client";

import { NotificationItem } from "@/components/notifications/NotificationItem";
import { Button } from "@/components/ui/button";
import { NOTIFICATION_LOAD_MORE_SCROLL_THRESHOLD_PX } from "@/services/notifications/notificationPagination";
import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef } from "react";

type VirtualizedNotificationListProps = {
  notifications: SerializedNotification[];
  markingId: string | null;
  onSelect: (notification: SerializedNotification) => void;
  hasMoreOlder: boolean;
  loadingOlder: boolean;
  olderError: string | null;
  onLoadOlder: () => void;
  onRetryOlder: () => void;
};

export function VirtualizedNotificationList({
  notifications,
  markingId,
  onSelect,
  hasMoreOlder,
  loadingOlder,
  olderError,
  onLoadOlder,
  onRetryOlder,
}: VirtualizedNotificationListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadOlderRequestedRef = useRef(false);

  const virtualizer = useVirtualizer({
    count: notifications.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 88,
    overscan: 8,
    getItemKey: (index) => notifications[index]?.id ?? index,
  });

  useEffect(() => {
    if (!loadingOlder && loadOlderRequestedRef.current) {
      loadOlderRequestedRef.current = false;
    }
  }, [loadingOlder]);

  const checkScrollForOlder = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }
    const distanceFromBottom =
      el.scrollHeight - el.scrollTop - el.clientHeight;
    if (
      distanceFromBottom <= NOTIFICATION_LOAD_MORE_SCROLL_THRESHOLD_PX &&
      hasMoreOlder &&
      !loadingOlder &&
      !loadOlderRequestedRef.current &&
      !olderError
    ) {
      loadOlderRequestedRef.current = true;
      onLoadOlder();
    }
  }, [hasMoreOlder, loadingOlder, olderError, onLoadOlder]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) {
      return;
    }

    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(checkScrollForOlder);
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener("scroll", onScroll);
    };
  }, [checkScrollForOlder]);

  return (
    <div className="flex flex-col gap-0">
      <div
        ref={scrollRef}
        className="max-h-[min(24rem,70vh)] overflow-y-auto overscroll-y-contain p-1"
        aria-label="Notifications list"
      >
        <div
          className="relative w-full"
          style={{ height: `${virtualizer.getTotalSize()}px` }}
        >
          {virtualizer.getVirtualItems().map((virtualRow) => {
            const notification = notifications[virtualRow.index];
            if (!notification) {
              return null;
            }
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={virtualizer.measureElement}
                className="absolute top-0 left-0 w-full pb-0.5"
                style={{
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <NotificationItem
                  notification={notification}
                  onSelect={onSelect}
                  disabled={markingId === notification.id}
                />
              </div>
            );
          })}
        </div>

        {loadingOlder ? (
          <div className="flex items-center justify-center gap-2 py-3 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" aria-hidden />
            Loading older…
          </div>
        ) : null}
      </div>

      {olderError ? (
        <div className="border-t border-border px-3 py-2 text-center">
          <p className="text-xs text-muted-foreground">{olderError}</p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-1 h-auto py-1 text-xs"
            onClick={() => void onRetryOlder()}
          >
            Retry
          </Button>
        </div>
      ) : null}
    </div>
  );
}
