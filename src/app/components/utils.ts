import type {
  Group,
  Balance,
  Settlement,
  Member,
  Expense,
  Split,
  PaymentAllocation,
  BalanceOffset,
} from "./types";

export const MEMBER_COLORS = [
  "#5b4cf5", "#e84393", "#00b896", "#f59e0b", "#3b82f6",
  "#ef4444", "#8b5cf6", "#10b981", "#f97316", "#06b6d4",
];

export function generateId(): string {
  return Math.random().toString(36).slice(2, 11);
}

export function formatCurrency(amount: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function getCurrencySymbol(currency = "USD"): string {
  try {
    const parts = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).formatToParts(0);

    return parts.find((part) => part.type === "currency")?.value ?? currency;
  } catch {
    return currency;
  }
}

export function getExpensePayerId(expense: Expense): string {
  return expense.paidBy;
}

export function isGroupAdmin(group: Group, member?: Member): boolean {
  if (!member) return false;
  const ownerId = group.adminId ?? group.members[0]?.id;
  return (
    member.id === ownerId ||
    member.uid === ownerId ||
    (group.adminIds ?? []).some(
      (adminId) => adminId === member.id || adminId === member.uid,
    )
  );
}

export function isExpenseSettled(group: Group, expense: Expense): boolean {
  const payerId = getExpensePayerId(expense);
  const confirmedAllocationsByMember = new Map<string, number>();

  for (const payment of group.payments ?? []) {
    if (payment.status !== "confirmed") continue;
    const allocatedCents = payment.allocations.reduce(
      (sum, allocation) =>
        allocation.expenseId === expense.id
          ? sum + Math.round(allocation.amount * 100)
          : sum,
      0,
    );
    if (allocatedCents === 0) continue;
    confirmedAllocationsByMember.set(
      payment.fromMemberId,
      (confirmedAllocationsByMember.get(payment.fromMemberId) ?? 0) +
        allocatedCents,
    );
  }
  for (const offset of group.balanceOffsets ?? []) {
    if (offset.status !== "confirmed") continue;
    const sides = [
      [offset.requesterMemberId, offset.debitAllocations],
      [offset.counterpartyMemberId, offset.creditAllocations],
    ] as const;
    for (const [memberId, allocations] of sides) {
      const allocatedCents = allocations.reduce(
        (sum, allocation) =>
          allocation.expenseId === expense.id
            ? sum + Math.round(allocation.amount * 100)
            : sum,
        0,
      );
      if (allocatedCents > 0) {
        confirmedAllocationsByMember.set(
          memberId,
          (confirmedAllocationsByMember.get(memberId) ?? 0) + allocatedCents,
        );
      }
    }
  }

  return expense.splits.every((split) => {
    if (split.memberId === payerId || split.amount <= 0.005) return true;
    if (split.paymentStatus === "confirmed") return true;
    return (
      (confirmedAllocationsByMember.get(split.memberId) ?? 0) >=
      Math.round(split.amount * 100)
    );
  });
}

export function canDirectlyConfirmSplit(
  expense: Expense,
  split: Split,
  memberId: string,
): boolean {
  const payerId = getExpensePayerId(expense);
  const isBorrower = split.memberId === memberId;
  const isRecipient = payerId === memberId;
  const isExpenseCreator = (expense.createdBy ?? expense.paidBy) === memberId;

  return (
    !isBorrower &&
    (isRecipient || isExpenseCreator) &&
    !(isRecipient && split.paymentStatus === "pending")
  );
}

export function allocateCustomShares(
  memberIds: string[],
  total: number,
  fixedAmounts: Record<string, number>,
): Record<string, number> {
  if (memberIds.length === 0) return {};

  const totalCents = Math.max(0, Math.round(total * 100));
  const allocation: Record<string, number> = {};
  let fixedCents = 0;

  for (const memberId of memberIds) {
    if (!(memberId in fixedAmounts)) continue;
    const cents = Math.max(0, Math.round((fixedAmounts[memberId] || 0) * 100));
    allocation[memberId] = cents / 100;
    fixedCents += cents;
  }

  const automaticMemberIds = memberIds.filter(
    (memberId) => !(memberId in fixedAmounts),
  );
  const remainingCents = Math.max(0, totalCents - fixedCents);
  const baseCents = automaticMemberIds.length
    ? Math.floor(remainingCents / automaticMemberIds.length)
    : 0;
  let extraCents = automaticMemberIds.length
    ? remainingCents % automaticMemberIds.length
    : 0;

  for (const memberId of automaticMemberIds) {
    const cents = baseCents + (extraCents > 0 ? 1 : 0);
    allocation[memberId] = cents / 100;
    if (extraCents > 0) extraCents -= 1;
  }

  return allocation;
}

function computeBalancesWithPaymentStatuses(
  group: Group,
  paymentStatuses: Set<"pending" | "confirmed">,
): Balance[] {
  const balances: Record<string, number> = {};
  const members = [...group.members, ...(group.formerMembers ?? [])];
  members.forEach((m) => (balances[m.id] = 0));

  group.expenses.forEach((exp) => {
    const payerId = getExpensePayerId(exp);
    const reservedSplitStatuses = paymentStatuses.has("pending")
      ? new Set(["pending", "confirmed"])
      : new Set(["confirmed"]);
    const completedOrReservedPayments = exp.splits.reduce(
      (sum, s) =>
        s.memberId !== payerId &&
        s.paymentStatus &&
        reservedSplitStatuses.has(s.paymentStatus)
          ? sum + s.amount
          : sum,
      0,
    );

    balances[payerId] =
      (balances[payerId] ?? 0) + exp.amount - completedOrReservedPayments;
    exp.splits.forEach((s) => {
      if (
        s.memberId !== payerId &&
        s.paymentStatus &&
        reservedSplitStatuses.has(s.paymentStatus)
      ) {
        return;
      }
      balances[s.memberId] = (balances[s.memberId] ?? 0) - s.amount;
    });
  });

  for (const payment of group.payments ?? []) {
    if (!paymentStatuses.has(payment.status as "pending" | "confirmed")) continue;
    balances[payment.fromMemberId] =
      (balances[payment.fromMemberId] ?? 0) + payment.amount;
    balances[payment.toMemberId] =
      (balances[payment.toMemberId] ?? 0) - payment.amount;
  }

  return members.map((m) => ({
    memberId: m.id,
    memberName: m.name,
    net: balances[m.id] ?? 0,
  }));
}

export function computeBalances(group: Group): Balance[] {
  return computeBalancesWithPaymentStatuses(group, new Set(["confirmed"]));
}

export function computeProjectedBalances(group: Group): Balance[] {
  return computeBalancesWithPaymentStatuses(
    group,
    new Set(["confirmed", "pending"]),
  );
}

export function getOutstandingExpenseShares(
  group: Group,
  fromMemberId: string,
): PaymentAllocation[] {
  const alreadyAllocatedCents = new Map<string, number>();
  for (const payment of group.payments ?? []) {
    if (
      payment.fromMemberId !== fromMemberId ||
      !["pending", "confirmed"].includes(payment.status)
    ) {
      continue;
    }
    for (const allocation of payment.allocations) {
      if (!allocation.expenseId) continue;
      alreadyAllocatedCents.set(
        allocation.expenseId,
        (alreadyAllocatedCents.get(allocation.expenseId) ?? 0) +
          Math.round(allocation.amount * 100),
      );
    }
  }
  for (const offset of group.balanceOffsets ?? []) {
    if (!["pending", "confirmed"].includes(offset.status)) continue;
    const allocations =
      offset.requesterMemberId === fromMemberId
        ? offset.debitAllocations
        : offset.counterpartyMemberId === fromMemberId
          ? offset.creditAllocations
          : [];
    for (const allocation of allocations) {
      if (!allocation.expenseId) continue;
      alreadyAllocatedCents.set(
        allocation.expenseId,
        (alreadyAllocatedCents.get(allocation.expenseId) ?? 0) +
          Math.round(allocation.amount * 100),
      );
    }
  }

  const expenses = [...group.expenses].sort(
    (a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id),
  );

  return expenses.flatMap((expense) => {
    const split = expense.splits.find(
      (candidate) => candidate.memberId === fromMemberId,
    );
    if (
      !split ||
      split.memberId === getExpensePayerId(expense) ||
      split.paymentStatus === "confirmed" ||
      split.paymentStatus === "pending"
    ) {
      return [];
    }

    const availableCents = Math.max(
      0,
      Math.round(split.amount * 100) -
        (alreadyAllocatedCents.get(expense.id) ?? 0),
    );
    return availableCents > 0
      ? [
          {
            expenseId: expense.id,
            expenseDescription: expense.description,
            amount: availableCents / 100,
          },
        ]
      : [];
  });
}

function directOutstandingShares(
  group: Group,
  debtorMemberId: string,
  creditorMemberId: string,
): PaymentAllocation[] {
  return getOutstandingExpenseShares(group, debtorMemberId).filter(
    (share) => {
      const expense = group.expenses.find((item) => item.id === share.expenseId);
      return expense && getExpensePayerId(expense) === creditorMemberId;
    },
  );
}

function allocateFromShares(
  shares: PaymentAllocation[],
  amount: number,
): PaymentAllocation[] {
  let remainingCents = Math.max(0, Math.round(amount * 100));
  const allocations: PaymentAllocation[] = [];
  for (const share of shares) {
    if (remainingCents <= 0) break;
    const cents = Math.min(remainingCents, Math.round(share.amount * 100));
    if (cents > 0) allocations.push({ ...share, amount: cents / 100 });
    remainingCents -= cents;
  }
  return allocations;
}

export interface BalanceOffsetPreview {
  amount: number;
  debitAllocations: PaymentAllocation[];
  creditAllocations: PaymentAllocation[];
  availableCredit: number;
  remainingCredit: number;
}

export function buildBalanceOffsetPreview(
  group: Group,
  requesterMemberId: string,
  counterpartyMemberId: string,
  requestedAmount: number,
  debitExpenseId?: string,
): BalanceOffsetPreview | undefined {
  const debitShares = directOutstandingShares(
    group,
    requesterMemberId,
    counterpartyMemberId,
  ).filter((share) => !debitExpenseId || share.expenseId === debitExpenseId);
  const creditShares = directOutstandingShares(
    group,
    counterpartyMemberId,
    requesterMemberId,
  );
  const debitTotal = debitShares.reduce((sum, share) => sum + share.amount, 0);
  const availableCredit = creditShares.reduce(
    (sum, share) => sum + share.amount,
    0,
  );
  const amount =
    Math.min(
      Math.round(Math.max(0, requestedAmount) * 100),
      Math.round(debitTotal * 100),
      Math.round(availableCredit * 100),
    ) / 100;
  if (amount <= 0.005) return undefined;

  return {
    amount,
    debitAllocations: allocateFromShares(debitShares, amount),
    creditAllocations: allocateFromShares(creditShares, amount),
    availableCredit,
    remainingCredit: Math.max(0, availableCredit - amount),
  };
}

export function createBalanceOffset(
  group: Group,
  requesterMemberId: string,
  counterpartyMemberId: string,
  amount: number,
  requestedAt: string,
  debitExpenseId?: string,
): BalanceOffset | undefined {
  const preview = buildBalanceOffsetPreview(
    group,
    requesterMemberId,
    counterpartyMemberId,
    amount,
    debitExpenseId,
  );
  if (!preview) return undefined;
  return {
    id: generateId(),
    requesterMemberId,
    counterpartyMemberId,
    amount: preview.amount,
    debitAllocations: preview.debitAllocations,
    creditAllocations: preview.creditAllocations,
    status: "pending",
    requestedAt,
    requestedBy: requesterMemberId,
  };
}

export function allocatePaymentToExpenses(
  group: Group,
  fromMemberId: string,
  amount: number,
  selectedExpenseIds?: string[],
): PaymentAllocation[] {
  let remainingCents = Math.max(0, Math.round(amount * 100));
  if (remainingCents === 0) return [];

  const selectedIds = selectedExpenseIds
    ? new Set(selectedExpenseIds)
    : undefined;
  const outstandingShares = getOutstandingExpenseShares(
    group,
    fromMemberId,
  ).filter(
    (allocation) =>
      !selectedIds || (!!allocation.expenseId && selectedIds.has(allocation.expenseId)),
  );
  const allocations: PaymentAllocation[] = [];

  for (const share of outstandingShares) {
    if (remainingCents === 0) break;
    const allocatedCents = Math.min(
      remainingCents,
      Math.round(share.amount * 100),
    );
    allocations.push({ ...share, amount: allocatedCents / 100 });
    remainingCents -= allocatedCents;
  }

  if (remainingCents > 0) {
    allocations.push({
      expenseDescription: selectedExpenseIds
        ? "Unallocated amount"
        : "Remaining group balance",
      amount: remainingCents / 100,
    });
  }

  return allocations;
}

export function computeSettlements(balances: Balance[]): Settlement[] {
  const settlements: Settlement[] = [];
  const debtors = balances.filter((b) => b.net < -0.005).map((b) => ({ ...b }));
  const creditors = balances.filter((b) => b.net > 0.005).map((b) => ({ ...b }));

  let i = 0;
  let j = 0;
  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const amount = Math.min(-debtor.net, creditor.net);

    settlements.push({
      from: debtor.memberId,
      fromName: debtor.memberName,
      to: creditor.memberId,
      toName: creditor.memberName,
      amount: Math.round(amount * 100) / 100,
    });

    debtor.net += amount;
    creditor.net -= amount;
    if (Math.abs(debtor.net) < 0.005) i++;
    if (Math.abs(creditor.net) < 0.005) j++;
  }

  return settlements;
}

export function getMemberById(group: Group, id: string): Member | undefined {
  return [...group.members, ...(group.formerMembers ?? [])].find(
    (member) => member.id === id,
  );
}

export function archiveGroupMember(group: Group, memberId: string): Group {
  const member = group.members.find((candidate) => candidate.id === memberId);
  if (!member) return group;

  const identifiers = new Set(
    [member.id, member.uid].filter((id): id is string => !!id),
  );
  return {
    ...group,
    members: group.members.filter((candidate) => candidate.id !== memberId),
    formerMembers: [
      ...(group.formerMembers ?? []).filter(
        (candidate) => candidate.id !== memberId,
      ),
      { ...member, removedAt: new Date().toISOString() },
    ],
    adminIds: (group.adminIds ?? []).filter(
      (candidate) => !identifiers.has(candidate),
    ),
  };
}

export function getTotalExpenses(group: Group): number {
  return group.expenses.reduce((sum, e) => sum + e.amount, 0);
}

export function getUnsettledPaymentSummary(group: Group, userId: string) {
  const member = group.members.find(
    (candidate) => candidate.id === userId || candidate.uid === userId,
  );
  if (!member) return { count: 0, amount: 0, pendingCount: 0, rejectedCount: 0 };

  const legacySplits = group.expenses.flatMap((expense) =>
    expense.splits.filter(
      (split) =>
        split.memberId === member.id &&
        split.memberId !== getExpensePayerId(expense) &&
        split.amount > 0.005 &&
        split.paymentStatus !== "confirmed",
    ),
  );
  const memberPayments = (group.payments ?? []).filter(
    (payment) => payment.fromMemberId === member.id,
  );
  const settlements = computeSettlements(computeBalances(group)).filter(
    (settlement) => settlement.from === member.id,
  );

  return {
    count: settlements.length,
    amount: settlements.reduce(
      (sum, settlement) => sum + settlement.amount,
      0,
    ),
    pendingCount:
      legacySplits.filter((split) => split.paymentStatus === "pending").length +
      memberPayments.filter((payment) => payment.status === "pending").length,
    rejectedCount:
      legacySplits.filter((split) => split.paymentStatus === "rejected").length +
      memberPayments.filter((payment) => payment.status === "rejected").length,
  };
}

export function mergeGroupMember(
  group: Group,
  sourceMemberId: string,
  destinationMemberId: string,
): Group {
  if (sourceMemberId === destinationMemberId) return group;

  const sourceMember = group.members.find(
    (member) => member.id === sourceMemberId,
  );
  const sourceIdentifiers = new Set(
    [sourceMemberId, sourceMember?.uid].filter(
      (identifier): identifier is string => !!identifier,
    ),
  );

  const replace = (memberId: string) =>
    sourceIdentifiers.has(memberId) ? destinationMemberId : memberId;

  return {
    ...group,
    adminId: group.adminId ? replace(group.adminId) : group.adminId,
    adminIds: group.adminIds?.map(replace).filter(
      (memberId, index, values) => values.indexOf(memberId) === index,
    ),
    members: group.members.filter((member) => member.id !== sourceMemberId),
    expenses: group.expenses.map((expense) => {
      const combined = new Map<string, Split>();
      for (const split of expense.splits) {
        const memberId = replace(split.memberId);
        const existing = combined.get(memberId);
        if (!existing) {
          combined.set(memberId, { ...split, memberId });
          continue;
        }
        combined.set(memberId, {
          ...existing,
          amount: existing.amount + split.amount,
          paymentStatus: [existing.paymentStatus, split.paymentStatus].every(
            (status) => status === "confirmed",
          )
            ? "confirmed"
            : [existing.paymentStatus, split.paymentStatus].includes("rejected")
              ? "rejected"
              : [existing.paymentStatus, split.paymentStatus].includes("pending")
                ? "pending"
                : undefined,
          paymentSubmission:
            split.paymentSubmission ?? existing.paymentSubmission,
        });
      }

      return {
        ...expense,
        paidBy: replace(expense.paidBy),
        createdBy: expense.createdBy ? replace(expense.createdBy) : undefined,
        splits: [...combined.values()].map((split) => ({
          ...split,
          confirmedBy: split.confirmedBy
            ? replace(split.confirmedBy)
            : undefined,
          paymentSubmission: split.paymentSubmission
            ? {
                ...split.paymentSubmission,
                reviewedBy: split.paymentSubmission.reviewedBy
                  ? replace(split.paymentSubmission.reviewedBy)
                  : undefined,
              }
            : undefined,
        })),
        receipts: expense.receipts?.map((receipt) => ({
          ...receipt,
          uploadedBy: replace(receipt.uploadedBy),
        })),
      };
    }),
    payments: group.payments?.map((payment) => ({
      ...payment,
      fromMemberId: replace(payment.fromMemberId),
      toMemberId: replace(payment.toMemberId),
      submittedBy: replace(payment.submittedBy),
      reviewedBy: payment.reviewedBy
        ? replace(payment.reviewedBy)
        : undefined,
      cancelledBy: payment.cancelledBy
        ? replace(payment.cancelledBy)
        : undefined,
      reversedBy: payment.reversedBy
        ? replace(payment.reversedBy)
        : undefined,
    })),
    balanceOffsets: group.balanceOffsets?.map((offset) => ({
      ...offset,
      requesterMemberId: replace(offset.requesterMemberId),
      counterpartyMemberId: replace(offset.counterpartyMemberId),
      requestedBy: replace(offset.requestedBy),
      reviewedBy: offset.reviewedBy ? replace(offset.reviewedBy) : undefined,
      cancelledBy: offset.cancelledBy
        ? replace(offset.cancelledBy)
        : undefined,
    })),
    messages: group.messages?.map((message) => ({
      ...message,
      memberId: replace(message.memberId),
      mentionedMemberIds: message.mentionedMemberIds
        ?.map(replace)
        .filter((memberId, index, values) => values.indexOf(memberId) === index),
    })),
    deletedExpenses: group.deletedExpenses?.map((expense) => ({
      ...expense,
      deletedBy: replace(expense.deletedBy),
    })),
  };
}

export const CATEGORY_ICONS: Record<string, string> = {
  food: "🍔",
  transport: "🚗",
  accommodation: "🏨",
  trip: "🧳",
  entertainment: "🎬",
  shopping: "🛍️",
  utilities: "💡",
  other: "📦",
};
