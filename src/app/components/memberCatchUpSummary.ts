import type { Group, Member } from "./types";
import { computeBalances, getExpensePayerId } from "./utils";

export interface MemberCatchUpSummary {
  balance: number;
  assignedExpenseCount: number;
  pendingReviewCount: number;
  adminConfirmedPaymentCount: number;
  earlierMessageCount: number;
}

function happenedBeforeOrAt(value: string | undefined, cutoff: string): boolean {
  if (!value) return true;
  return value <= cutoff;
}

export function buildMemberCatchUpSummary(
  group: Group,
  member: Member,
): MemberCatchUpSummary {
  const joinedAt = member.joinedAt ?? new Date().toISOString();
  const assignedExpenseCount = group.expenses.filter(
    (expense) =>
      happenedBeforeOrAt(expense.createdAt ?? expense.date, joinedAt) &&
      expense.splits.some(
        (split) => split.memberId === member.id && split.amount > 0.005,
      ),
  ).length;
  const modernPendingReviews = (group.payments ?? []).filter(
    (payment) =>
      payment.toMemberId === member.id &&
      payment.status === "pending" &&
      happenedBeforeOrAt(payment.submittedAt, joinedAt),
  ).length;
  const legacyPendingReviews = group.expenses.reduce(
    (count, expense) =>
      count +
      (getExpensePayerId(expense) === member.id
        ? expense.splits.filter(
            (split) =>
              split.memberId !== member.id &&
              split.paymentStatus === "pending" &&
              happenedBeforeOrAt(
                split.paymentSubmission?.submittedAt,
                joinedAt,
              ),
          ).length
        : 0),
    0,
  );

  return {
    balance:
      computeBalances(group).find((balance) => balance.memberId === member.id)
        ?.net ?? 0,
    assignedExpenseCount,
    pendingReviewCount: modernPendingReviews + legacyPendingReviews,
    adminConfirmedPaymentCount: (group.payments ?? []).filter(
      (payment) =>
        payment.toMemberId === member.id &&
        payment.status === "confirmed" &&
        payment.reviewedOnBehalfOfMemberId === member.id &&
        happenedBeforeOrAt(payment.reviewedAt, joinedAt),
    ).length,
    earlierMessageCount: (group.messages ?? []).filter(
      (message) =>
        message.memberId !== member.id &&
        happenedBeforeOrAt(message.createdAt, joinedAt),
    ).length,
  };
}
