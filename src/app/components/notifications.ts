import type {
  AppNotification,
  Group,
  NotificationPreferences,
} from "./types";
import { formatCurrency, getMemberById } from "./utils";

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  payments: true,
  expenses: true,
  chat: true,
  memberActivity: false,
  systemNotifications: false,
  mutedChatGroupIds: [],
};

export function normalizeNotificationPreferences(
  preferences?: Partial<NotificationPreferences>,
): NotificationPreferences {
  return {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...preferences,
    mutedChatGroupIds: Array.isArray(preferences?.mutedChatGroupIds)
      ? preferences.mutedChatGroupIds
      : [],
  };
}

export function deriveNotifications(
  groups: Group[],
  userId: string,
  preferences?: Partial<NotificationPreferences>,
): AppNotification[] {
  const settings = normalizeNotificationPreferences(preferences);
  const notifications = groups.flatMap((group) => {
    const currentMember = group.members.find(
      (member) => member.id === userId || member.uid === userId,
    );
    if (!currentMember) return [];

    const currentMemberId = currentMember.id;
    const items: AppNotification[] = [];
    const add = (
      notification: Omit<AppNotification, "groupId" | "groupName">,
    ) => {
      if (!isValidTimestamp(notification.at)) return;
      items.push({
        ...notification,
        groupId: group.id,
        groupName: group.name,
      });
    };

    if (settings.payments) {
      for (const payment of group.payments ?? []) {
        const from = getMemberById(group, payment.fromMemberId);
        const to = getMemberById(group, payment.toMemberId);
        const amount = formatCurrency(payment.amount, group.currency);

        if (
          payment.toMemberId === currentMemberId &&
          payment.submittedBy !== currentMemberId
        ) {
          add({
            id: `${group.id}:payment:${payment.id}:submitted:${payment.submittedAt}`,
            type: "payment_submitted",
            title: "Payment ready for review",
            body: `${from?.name ?? "Someone"} submitted ${amount}`,
            at: payment.submittedAt,
            actorId: payment.submittedBy,
            destination: { tab: "settle", paymentId: payment.id },
          });
        }

        if (
          (payment.status === "confirmed" || payment.status === "reversed") &&
          payment.fromMemberId === currentMemberId &&
          payment.reviewedBy !== currentMemberId &&
          payment.reviewedAt
        ) {
          add({
            id: `${group.id}:payment:${payment.id}:confirmed:${payment.reviewedAt}`,
            type: "payment_confirmed",
            title: "Payment confirmed",
            body: `${to?.name ?? "The recipient"} confirmed your ${amount} payment`,
            at: payment.reviewedAt,
            actorId: payment.reviewedBy,
            destination: { tab: "settle", paymentId: payment.id },
          });
        }

        if (
          payment.status === "rejected" &&
          payment.fromMemberId === currentMemberId &&
          payment.reviewedBy !== currentMemberId &&
          payment.reviewedAt
        ) {
          add({
            id: `${group.id}:payment:${payment.id}:rejected:${payment.reviewedAt}`,
            type: "payment_rejected",
            title: "Payment needs correction",
            body:
              payment.rejectionReason ??
              `${to?.name ?? "The recipient"} rejected the payment`,
            at: payment.reviewedAt,
            actorId: payment.reviewedBy,
            destination: { tab: "settle", paymentId: payment.id },
          });
        }

        if (
          payment.status === "cancelled" &&
          payment.toMemberId === currentMemberId &&
          payment.cancelledBy !== currentMemberId &&
          payment.cancelledAt
        ) {
          add({
            id: `${group.id}:payment:${payment.id}:cancelled:${payment.cancelledAt}`,
            type: "payment_cancelled",
            title: "Payment cancelled",
            body: `${from?.name ?? "The payer"} cancelled a ${amount} payment`,
            at: payment.cancelledAt,
            actorId: payment.cancelledBy,
            destination: { tab: "settle", paymentId: payment.id },
          });
        }

        if (
          payment.status === "reversed" &&
          payment.fromMemberId === currentMemberId &&
          payment.reversedBy !== currentMemberId &&
          payment.reversedAt
        ) {
          add({
            id: `${group.id}:payment:${payment.id}:reversed:${payment.reversedAt}`,
            type: "payment_reversed",
            title: "Payment reversed",
            body:
              payment.reversalReason ??
              `${to?.name ?? "The recipient"} reversed a ${amount} payment`,
            at: payment.reversedAt,
            actorId: payment.reversedBy,
            destination: { tab: "settle", paymentId: payment.id },
          });
        }
      }

      for (const expense of group.expenses) {
        for (const split of expense.splits) {
          if (
            split.memberId === expense.paidBy ||
            !split.paymentSubmission
          ) {
            continue;
          }
          const borrower = getMemberById(group, split.memberId);
          const recipient = getMemberById(group, expense.paidBy);
          const submission = split.paymentSubmission;

          if (expense.paidBy === currentMemberId) {
            add({
              id: `${group.id}:legacy-payment:${expense.id}:${split.memberId}:submitted:${submission.submittedAt}`,
              type: "payment_submitted",
              title: "Payment ready for review",
              body: `${borrower?.name ?? "Someone"} submitted payment for ${expense.description}`,
              at: submission.submittedAt,
              actorId: split.memberId,
              destination: { tab: "settle" },
            });
          }

          if (
            split.paymentStatus === "confirmed" &&
            split.memberId === currentMemberId &&
            submission.reviewedAt
          ) {
            add({
              id: `${group.id}:legacy-payment:${expense.id}:${split.memberId}:confirmed:${submission.reviewedAt}`,
              type: "payment_confirmed",
              title: "Payment confirmed",
              body: `${recipient?.name ?? "The recipient"} confirmed payment for ${expense.description}`,
              at: submission.reviewedAt,
              actorId: submission.reviewedBy,
              destination: { tab: "settle" },
            });
          }

          if (
            split.paymentStatus === "rejected" &&
            split.memberId === currentMemberId &&
            submission.reviewedAt
          ) {
            add({
              id: `${group.id}:legacy-payment:${expense.id}:${split.memberId}:rejected:${submission.reviewedAt}`,
              type: "payment_rejected",
              title: "Payment needs correction",
              body:
                submission.rejectionReason ??
                `Payment for ${expense.description} was rejected`,
              at: submission.reviewedAt,
              actorId: submission.reviewedBy,
              destination: { tab: "settle" },
            });
          }
        }
      }
    }

    if (settings.expenses) {
      for (const expense of group.expenses) {
        const creatorId = expense.createdBy ?? expense.paidBy;
        const affectsCurrentMember =
          expense.paidBy === currentMemberId ||
          expense.splits.some((split) => split.memberId === currentMemberId);
        if (!affectsCurrentMember) continue;

        if (creatorId !== currentMemberId && expense.createdAt) {
          const creator = getMemberById(group, creatorId);
          const createdAt = expense.createdAt;
          add({
            id: `${group.id}:expense:${expense.id}:created:${createdAt}`,
            type: "expense_created",
            title: "New expense involving you",
            body: `${creator?.name ?? "Someone"} added ${expense.description}`,
            at: createdAt,
            actorId: creatorId,
            destination: { tab: "expenses", expenseId: expense.id },
          });
        }

        if (
          expense.updatedAt &&
          expense.updatedBy &&
          expense.updatedBy !== currentMemberId
        ) {
          const editor = getMemberById(group, expense.updatedBy);
          add({
            id: `${group.id}:expense:${expense.id}:updated:${expense.updatedAt}`,
            type: "expense_updated",
            title: "Expense updated",
            body: `${editor?.name ?? "Someone"} updated ${expense.description}`,
            at: expense.updatedAt,
            actorId: expense.updatedBy,
            destination: { tab: "expenses", expenseId: expense.id },
          });
        }
      }

      for (const deleted of group.deletedExpenses ?? []) {
        if (deleted.deletedBy === currentMemberId) continue;
        const actor = getMemberById(group, deleted.deletedBy);
        add({
          id: `${group.id}:expense:${deleted.expenseId}:deleted:${deleted.deletedAt}`,
          type: "expense_deleted",
          title: "Expense deleted",
          body: `${actor?.name ?? "Someone"} deleted ${deleted.description}`,
          at: deleted.deletedAt,
          actorId: deleted.deletedBy,
          destination: { tab: "expenses" },
        });
      }
    }

    if (
      settings.chat &&
      !settings.mutedChatGroupIds.includes(group.id)
    ) {
      for (const message of group.messages ?? []) {
        if (message.memberId === currentMemberId) continue;
        const sender = getMemberById(group, message.memberId);
        add({
          id: `${group.id}:message:${message.id}`,
          type: "chat_message",
          title: `${sender?.name ?? "Someone"} in ${group.name}`,
          body: message.text,
          at: message.createdAt,
          actorId: message.memberId,
          destination: { tab: "chat", messageId: message.id },
        });
      }
    }

    if (settings.memberActivity) {
      const adminId = group.adminId ?? group.members[0]?.id;
      const isAdmin =
        currentMemberId === adminId ||
        currentMember.uid === adminId ||
        (group.adminIds ?? []).some(
          (id) => id === currentMemberId || id === currentMember.uid,
        );
      if (isAdmin) {
        for (const member of group.members) {
          if (
            !member.uid ||
            member.id === currentMemberId ||
            !member.joinedAt
          ) {
            continue;
          }
          add({
            id: `${group.id}:member:${member.id}:joined:${member.joinedAt}`,
            type: "member_joined",
            title: "Member joined",
            body: `${member.name} joined ${group.name}`,
            at: member.joinedAt,
            actorId: member.id,
            destination: { tab: "expenses" },
          });
        }
      }
    }

    return items;
  });

  return notifications.sort(
    (a, b) =>
      new Date(b.at).getTime() - new Date(a.at).getTime() ||
      b.id.localeCompare(a.id),
  );
}

export function isNotificationUnread(
  notification: AppNotification,
  readAt?: string,
): boolean {
  if (!readAt) return false;
  return notification.at > readAt;
}

export function notificationUrl(notification: AppNotification): string {
  const params = new URLSearchParams({
    openGroup: notification.groupId,
    tab: notification.destination.tab,
  });
  if (notification.destination.expenseId) {
    params.set("expense", notification.destination.expenseId);
  }
  if (notification.destination.paymentId) {
    params.set("payment", notification.destination.paymentId);
  }
  if (notification.destination.messageId) {
    params.set("message", notification.destination.messageId);
  }
  return `/?${params.toString()}`;
}

function isValidTimestamp(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}
