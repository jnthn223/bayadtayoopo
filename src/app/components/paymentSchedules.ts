import type {
  Group,
  PaymentAllocation,
  PaymentSchedule,
  PaymentScheduleFrequency,
} from "./types";
import { generateId, getExpensePayerId, getOutstandingExpenseShares } from "./utils";

export const OPEN_PAYMENT_SCHEDULE_STATUSES = new Set([
  "proposed",
  "active",
  "paused",
]);

export function directSharesOwedTo(
  group: Group,
  debtorMemberId: string,
  payeeMemberId: string,
): PaymentAllocation[] {
  return getOutstandingExpenseShares(group, debtorMemberId).filter((share) => {
    const expense = group.expenses.find((item) => item.id === share.expenseId);
    return expense && getExpensePayerId(expense) === payeeMemberId;
  });
}

export function openSchedulesBetween(
  group: Group,
  firstMemberId: string,
  secondMemberId: string,
): PaymentSchedule[] {
  return (group.paymentSchedules ?? []).filter(
    (schedule) =>
      OPEN_PAYMENT_SCHEDULE_STATUSES.has(schedule.status) &&
      ((schedule.payeeMemberId === firstMemberId && schedule.debtorMemberId === secondMemberId) ||
        (schedule.payeeMemberId === secondMemberId && schedule.debtorMemberId === firstMemberId)),
  );
}

export function coveredByOpenSchedule(group: Group): Set<string> {
  return new Set(
    (group.paymentSchedules ?? [])
      .filter((schedule) => OPEN_PAYMENT_SCHEDULE_STATUSES.has(schedule.status))
      .flatMap((schedule) =>
        schedule.coverage.map(
          (coverage) => `${schedule.debtorMemberId}:${coverage.expenseId}`,
        ),
      ),
  );
}

export function createPaymentSchedule({
  payeeMemberId,
  debtorMemberId,
  shares,
  selectedExpenseIds,
  installmentAmount,
  frequency,
  firstPaymentDate,
  message,
  now = new Date().toISOString(),
}: {
  payeeMemberId: string;
  debtorMemberId: string;
  shares: PaymentAllocation[];
  selectedExpenseIds: string[];
  installmentAmount: number;
  frequency: PaymentScheduleFrequency;
  firstPaymentDate: string;
  message?: string;
  now?: string;
}): PaymentSchedule {
  const selected = new Set(selectedExpenseIds);
  const coverage = shares
    .filter((share) => !!share.expenseId && selected.has(share.expenseId))
    .map((share) => ({
      expenseId: share.expenseId!,
      expenseDescription: share.expenseDescription,
      amount: share.amount,
    }));
  if (coverage.length === 0) throw new Error("Choose at least one expense.");
  const total = coverage.reduce((sum, item) => sum + item.amount, 0);
  if (!Number.isFinite(installmentAmount) || installmentAmount <= 0 || installmentAmount > total + 0.005) {
    throw new Error("Enter an installment amount up to the covered balance.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(firstPaymentDate)) {
    throw new Error("Choose the first payment date.");
  }
  const id = generateId();
  return {
    id,
    payeeMemberId,
    debtorMemberId,
    coverage,
    installmentAmount: Math.round(installmentAmount * 100) / 100,
    frequency,
    firstPaymentDate,
    message: message?.trim() || undefined,
    status: "proposed",
    createdAt: now,
    createdBy: payeeMemberId,
    proposedBy: payeeMemberId,
    awaitingMemberId: debtorMemberId,
    updatedAt: now,
    activity: [{ id: generateId(), type: "created", actorMemberId: payeeMemberId, at: now }],
  };
}

export function scheduleTotal(schedule: PaymentSchedule): number {
  return schedule.coverage.reduce((sum, item) => sum + item.amount, 0);
}

export function frequencyLabel(frequency: PaymentScheduleFrequency): string {
  if (frequency === "weekly") return "every week";
  if (frequency === "biweekly") return "every two weeks";
  return "every month";
}
