"use client";

import { NotificationItem } from "@/components/notifications/NotificationItem";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";
import { BellOff, Loader2 } from "lucide-react";

type NotificationPopoverProps = {
  notifications: SerializedNotification[];
  unreadCount: number;
  loading: boolean;
  error: string | null;
  markingId: string | null;
  onSelect: (notification: SerializedNotification) => void;
};

export function NotificationPopover({
  notifications,
  unreadCount,
  loading,
  error,
  markingId,
  onSelect,
}: NotificationPopoverProps) {
  return (
    <div className="flex w-[min(100vw-2rem,22rem)] flex-col gap-0 p-0">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <p className="text-sm font-medium">Notifications</p>
        {unreadCount > 0 ? (
          <Badge variant="secondary" className="font-normal">
            {unreadCount} unread
          </Badge>
        ) : null}
      </div>
      <Separator />
      {loading && notifications.length === 0 ? (
        <div className="flex items-center justify-center gap-2 px-4 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" aria-hidden />
          Loading…
        </div>
      ) : error && notifications.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-muted-foreground">
          {error}
        </div>
      ) : notifications.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <BellOff className="size-8 text-muted-foreground/70" aria-hidden />
          <p className="text-sm text-muted-foreground">No notifications yet</p>
        </div>
      ) : (
        <ScrollArea className="max-h-[min(24rem,70vh)]">
          <div className="flex flex-col gap-0.5 p-1">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onSelect={onSelect}
                disabled={markingId === notification.id}
              />
            ))}
          </div>
        </ScrollArea>
      )}
      {error && notifications.length > 0 ? (
        <p className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
          {error}
        </p>
      ) : null}
    </div>
  );
}
