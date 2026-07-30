import type { Group, NotificationType } from "./types";

export interface PushEvent {
  type: NotificationType;
  entityId: string;
  occurredAt: string;
}

function memberIdentifiers(group: Group, uid: string): Set<string> {
  const member = group.members.find(
    (candidate) => candidate.uid === uid || candidate.id === uid,
  );
  return new Set([uid, member?.id, member?.uid].filter(Boolean) as string[]);
}

export function collectPushEvents(
  before: Group | null,
  after: Group,
  actorUid: string,
): PushEvent[] {
  if (!before) return [];
  const actorIds = memberIdentifiers(after, actorUid);
  const events: PushEvent[] = [];
  const add = (
    type: NotificationType,
    entityId: string,
    occurredAt?: string,
  ) => {
    if (occurredAt) events.push({ type, entityId, occurredAt });
  };

  const oldMessages = new Set((before.messages ?? []).map((item) => item.id));
  for (const message of after.messages ?? []) {
    if (!oldMessages.has(message.id) && actorIds.has(message.memberId)) {
      add("chat_message", message.id, message.createdAt);
    }
  }

  const oldExpenses = new Map(
    before.expenses.map((expense) => [expense.id, expense]),
  );
  for (const expense of after.expenses) {
    const previous = oldExpenses.get(expense.id);
    if (
      !previous &&
      expense.createdBy &&
      actorIds.has(expense.createdBy)
    ) {
      add("expense_created", expense.id, expense.createdAt);
    } else if (
      previous &&
      expense.updatedBy &&
      actorIds.has(expense.updatedBy) &&
      expense.updatedAt !== previous.updatedAt
    ) {
      add("expense_updated", expense.id, expense.updatedAt);
    }
  }

  const oldDeleted = new Set(
    (before.deletedExpenses ?? []).map((expense) => expense.expenseId),
  );
  for (const expense of after.deletedExpenses ?? []) {
    if (
      !oldDeleted.has(expense.expenseId) &&
      actorIds.has(expense.deletedBy)
    ) {
      add("expense_deleted", expense.expenseId, expense.deletedAt);
    }
  }

  const oldPayments = new Map(
    (before.payments ?? []).map((payment) => [payment.id, payment]),
  );
  for (const payment of after.payments ?? []) {
    const previous = oldPayments.get(payment.id);
    if (!previous && actorIds.has(payment.submittedBy)) {
      add("payment_submitted", payment.id, payment.submittedAt);
    }
    if (!previous || previous.status === payment.status) continue;
    if (
      payment.status === "confirmed" &&
      payment.reviewedBy &&
      actorIds.has(payment.reviewedBy)
    ) {
      add("payment_confirmed", payment.id, payment.reviewedAt);
    } else if (
      payment.status === "rejected" &&
      payment.reviewedBy &&
      actorIds.has(payment.reviewedBy)
    ) {
      add("payment_rejected", payment.id, payment.reviewedAt);
    } else if (
      payment.status === "cancelled" &&
      payment.cancelledBy &&
      actorIds.has(payment.cancelledBy)
    ) {
      add("payment_cancelled", payment.id, payment.cancelledAt);
    } else if (
      payment.status === "reversed" &&
      payment.reversedBy &&
      actorIds.has(payment.reversedBy)
    ) {
      add("payment_reversed", payment.id, payment.reversedAt);
    }
  }

  return events;
}
