import { useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Bell,
  Check,
  CreditCard,
  MessageCircle,
  Receipt,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import type { AppNotification } from "./types";
import { isNotificationUnread } from "./notifications";

interface Props {
  notifications: AppNotification[];
  readAt?: string;
  onOpenNotification: (notification: AppNotification) => void;
  onMarkAllRead: () => void;
}

export function NotificationInbox({
  notifications,
  readAt,
  onOpenNotification,
  onMarkAllRead,
}: Props) {
  const [open, setOpen] = useState(false);
  const unreadCount = notifications.filter((notification) =>
    isNotificationUnread(notification, readAt),
  ).length;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="relative flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-all active:scale-95"
          aria-label={
            unreadCount > 0
              ? `${unreadCount} unread notifications`
              : "Notifications"
          }
        >
          <Bell size={19} />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 min-w-5 h-5 rounded-full bg-destructive px-1 text-center text-[10px] font-bold leading-5 text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed inset-0 z-[60] flex flex-col bg-background sm:inset-x-auto sm:left-1/2 sm:w-full sm:max-w-sm sm:-translate-x-1/2">
          <header className="flex items-center justify-between border-b border-border bg-card px-4 pb-4 pt-12">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                Notifications
              </Dialog.Title>
              <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                Updates from your groups
              </Dialog.Description>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-full p-2 hover:bg-muted"
              aria-label="Close notifications"
            >
              <X size={19} />
            </button>
          </header>

          {notifications.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-8 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-accent">
                <Bell size={27} className="text-accent-foreground" />
              </div>
              <p className="font-medium text-foreground">Nothing new yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Payment, expense, and chat updates will appear here.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-4 py-3">
                <p className="text-xs font-medium text-muted-foreground">
                  {unreadCount > 0
                    ? `${unreadCount} unread`
                    : "You’re all caught up"}
                </p>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={onMarkAllRead}
                    className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary"
                  >
                    <Check size={13} />
                    Mark all read
                  </button>
                )}
              </div>
              <div className="flex-1 overflow-y-auto px-4 pb-8 space-y-2">
                {notifications.slice(0, 100).map((notification) => {
                  const unread = isNotificationUnread(notification, readAt);
                  const Icon = notificationIcon(notification);
                  return (
                    <button
                      key={notification.id}
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onOpenNotification(notification);
                      }}
                      className={`relative flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition-all active:scale-[0.99] ${
                        unread
                          ? "border-primary/25 bg-accent/60"
                          : "border-border bg-card"
                      }`}
                    >
                      {unread && (
                        <span className="absolute right-3 top-3 h-2 w-2 rounded-full bg-primary" />
                      )}
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                        <Icon size={17} className="text-accent-foreground" />
                      </div>
                      <div className="min-w-0 flex-1 pr-2">
                        <div className="flex items-center gap-2">
                          <p className="truncate text-xs font-semibold text-primary">
                            {notification.groupName}
                          </p>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatNotificationTime(notification.at)}
                          </span>
                        </div>
                        <p className="mt-1 text-sm font-medium text-foreground">
                          {notification.title}
                        </p>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                          {notification.body}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function notificationIcon(notification: AppNotification) {
  if (notification.type.startsWith("payment_")) return CreditCard;
  if (notification.type === "chat_message") return MessageCircle;
  if (notification.type === "expense_deleted") return Trash2;
  if (notification.type === "member_joined") return UserPlus;
  return Receipt;
}

function formatNotificationTime(value: string): string {
  const date = new Date(value);
  const elapsed = Date.now() - date.getTime();
  if (elapsed < 60_000) return "Now";
  if (elapsed < 3_600_000) return `${Math.floor(elapsed / 60_000)}m`;
  if (elapsed < 86_400_000) return `${Math.floor(elapsed / 3_600_000)}h`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
