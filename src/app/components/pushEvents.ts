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
  if (
    after.kind === "direct" &&
    after.directStatus === "pending" &&
    before.expenses.length === 0 &&
    after.expenses.length > 0 &&
    after.directRequestedBy &&
    actorIds.has(after.directRequestedBy)
  ) {
    add("direct_request", after.id, after.directRequestedAt);
  }
  if (
    after.kind === "direct" &&
    before.directStatus !== after.directStatus &&
    after.directReviewedBy &&
    actorIds.has(after.directReviewedBy)
  ) {
    const type = {
      active: "direct_request_accepted",
      declined: "direct_request_declined",
      withdrawn: "direct_request_withdrawn",
    }[after.directStatus ?? ""] as NotificationType | undefined;
    if (type) add(type, after.id, after.directReviewedAt);
  }
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

  const oldOffsets = new Map(
    (before.balanceOffsets ?? []).map((offset) => [offset.id, offset]),
  );
  for (const offset of after.balanceOffsets ?? []) {
    const previous = oldOffsets.get(offset.id);
    if (!previous && actorIds.has(offset.requestedBy)) {
      add("balance_offset_requested", offset.id, offset.requestedAt);
    }
    if (!previous || previous.status === offset.status) continue;
    if (
      offset.status === "confirmed" &&
      offset.reviewedBy &&
      actorIds.has(offset.reviewedBy)
    ) {
      add("balance_offset_confirmed", offset.id, offset.reviewedAt);
    } else if (
      offset.status === "rejected" &&
      offset.reviewedBy &&
      actorIds.has(offset.reviewedBy)
    ) {
      add("balance_offset_rejected", offset.id, offset.reviewedAt);
    } else if (
      offset.status === "cancelled" &&
      offset.cancelledBy &&
      actorIds.has(offset.cancelledBy)
    ) {
      add("balance_offset_cancelled", offset.id, offset.cancelledAt);
    }
  }

  const oldSchedules = new Map(
    (before.paymentSchedules ?? []).map((schedule) => [schedule.id, schedule]),
  );
  for (const schedule of after.paymentSchedules ?? []) {
    const previous = oldSchedules.get(schedule.id);
    if (!previous && actorIds.has(schedule.createdBy)) {
      add("payment_schedule_proposed", schedule.id, schedule.updatedAt);
      continue;
    }
    if (!previous) continue;
    const latest = schedule.activity.at(-1);
    if (!latest || !actorIds.has(latest.actorMemberId)) continue;
    if (previous.status === schedule.status && previous.updatedAt !== schedule.updatedAt && latest.type === "edited") {
      add("payment_schedule_updated", schedule.id, latest.at);
      continue;
    }
    if (previous.status === schedule.status) continue;
    if (schedule.status === "active" && latest.type === "accepted") {
      add("payment_schedule_accepted", schedule.id, latest.at);
    } else if (schedule.status === "declined") {
      add("payment_schedule_declined", schedule.id, latest.at);
    } else {
      add("payment_schedule_updated", schedule.id, latest.at);
    }
  }

  const oldCorrections = new Map(
    (before.expenseCorrectionRequests ?? []).map((request) => [request.id, request]),
  );
  for (const request of after.expenseCorrectionRequests ?? []) {
    const previous = oldCorrections.get(request.id);
    if (!previous && actorIds.has(request.requestedBy)) {
      add("direct_correction_requested", request.id, request.requestedAt);
      continue;
    }
    if (!previous || previous.status === request.status) continue;
    if (request.reviewedBy && actorIds.has(request.reviewedBy)) {
      const type = {
        approved: "direct_correction_approved",
        rejected: "direct_correction_rejected",
        cancelled: "direct_correction_cancelled",
      }[request.status] as NotificationType | undefined;
      if (type) add(type, request.id, request.reviewedAt);
    }
  }

  return events;
}
