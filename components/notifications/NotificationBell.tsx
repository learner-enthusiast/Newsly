"use client";

import { NotificationPopover } from "@/components/notifications/NotificationPopover";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  formatNotificationBadgeCount,
  useNotifications,
} from "@/hooks/useNotifications";
import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";
import { cn } from "cn";
import { Bell } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useRef, useState } from "react";

const HOVER_CLOSE_DELAY_MS = 180;

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const closeTimeoutRef = useRef<number | null>(null);
  const isPointerInsideRef = useRef(false);

  const {
    notifications,
    unreadCount,
    loading,
    error,
    markAsRead,
  } = useNotifications(true);

  const clearCloseTimeout = useCallback(() => {
    if (closeTimeoutRef.current !== null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      if (!isPointerInsideRef.current) {
        setOpen(false);
      }
    }, HOVER_CLOSE_DELAY_MS);
  }, [clearCloseTimeout]);

  const handlePointerEnter = useCallback(() => {
    isPointerInsideRef.current = true;
    clearCloseTimeout();
    setOpen(true);
  }, [clearCloseTimeout]);

  const handlePointerLeave = useCallback(() => {
    isPointerInsideRef.current = false;
    scheduleClose();
  }, [scheduleClose]);

  const handleSelect = useCallback(
    async (notification: SerializedNotification) => {
      setMarkingId(notification.id);
      const ok = await markAsRead(notification);
      setMarkingId(null);

      if (!ok) {
        return;
      }

      setOpen(false);

      const link = notification.link?.trim();
      if (link) {
        if (link.startsWith("/")) {
          router.push(link);
        } else {
          window.location.assign(link);
        }
      }
    },
    [markAsRead, router],
  );

  const badgeLabel =
    unreadCount > 0
      ? `${formatNotificationBadgeCount(unreadCount)} unread notifications`
      : "No unread notifications";

  return (
    <div
      className="relative"
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="relative"
              aria-label={`Notifications. ${badgeLabel}`}
            />
          }
        >
          <Bell className="size-4" aria-hidden />
          {unreadCount > 0 ? (
            <span
              className={cn(
                "pointer-events-none absolute -top-0.5 -right-0.5 flex min-w-4 items-center justify-center rounded-full",
                "bg-primary px-1 py-0.5 text-[10px] font-semibold leading-none text-primary-foreground",
              )}
              aria-hidden
            >
              {formatNotificationBadgeCount(unreadCount)}
            </span>
          ) : null}
        </PopoverTrigger>
        <PopoverContent
          align="end"
          sideOffset={8}
          className="w-auto p-0"
          onPointerEnter={handlePointerEnter}
          onPointerLeave={handlePointerLeave}
        >
          <NotificationPopover
            notifications={notifications}
            unreadCount={unreadCount}
            loading={loading}
            error={error}
            markingId={markingId}
            onSelect={(notification) => {
              void handleSelect(notification);
            }}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
