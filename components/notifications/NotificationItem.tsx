"use client";

import { formatRelativeTime } from "@/services/news/newsRequestDisplay";
import type { SerializedNotification } from "@/services/notifications/notificationApiSchemas";
import { cn } from "cn";

type NotificationItemProps = {
  notification: SerializedNotification;
  onSelect: (notification: SerializedNotification) => void;
  disabled?: boolean;
};

export function NotificationItem({
  notification,
  onSelect,
  disabled = false,
}: NotificationItemProps) {
  const relativeTime =
    formatRelativeTime(notification.createdAt) ?? "Recently";
  const isUnread = !notification.read;

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onSelect(notification)}
      className={cn(
        "flex w-full flex-col gap-0.5 rounded-md px-3 py-2.5 text-left transition-colors",
        "hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-60",
        isUnread && "bg-muted/35",
      )}
    >
      <div className="flex items-start gap-2">
        <span
          className={cn(
            "mt-1.5 size-1.5 shrink-0 rounded-full",
            isUnread ? "bg-primary" : "bg-transparent",
          )}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "text-sm leading-snug",
              isUnread ? "font-medium text-foreground" : "text-foreground/90",
            )}
          >
            {notification.title}
          </p>
          {notification.message ? (
            <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
              {notification.message}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">{relativeTime}</p>
        </div>
      </div>
    </button>
  );
}
