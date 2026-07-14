import type { Group, Balance, Settlement, Member, Expense, Split } from "./types";

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

export function computeBalances(group: Group): Balance[] {
  const balances: Record<string, number> = {};
  const members = [...group.members, ...(group.formerMembers ?? [])];
  members.forEach((m) => (balances[m.id] = 0));

  group.expenses.forEach((exp) => {
    const payerId = getExpensePayerId(exp);
    const confirmedPayments = exp.splits.reduce(
      (sum, s) =>
        s.memberId !== payerId && s.paymentStatus === "confirmed"
          ? sum + s.amount
          : sum,
      0,
    );

    balances[payerId] = (balances[payerId] ?? 0) + exp.amount - confirmedPayments;
    exp.splits.forEach((s) => {
      if (s.memberId !== payerId && s.paymentStatus === "confirmed") return;
      balances[s.memberId] = (balances[s.memberId] ?? 0) - s.amount;
    });
  });

  return members.map((m) => ({
    memberId: m.id,
    memberName: m.name,
    net: balances[m.id] ?? 0,
  }));
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

  const splits = group.expenses.flatMap((expense) =>
    expense.splits.filter(
      (split) =>
        split.memberId === member.id &&
        split.memberId !== getExpensePayerId(expense) &&
        split.amount > 0.005 &&
        split.paymentStatus !== "confirmed",
    ),
  );

  return {
    count: splits.length,
    amount: splits.reduce((sum, split) => sum + split.amount, 0),
    pendingCount: splits.filter((split) => split.paymentStatus === "pending")
      .length,
    rejectedCount: splits.filter((split) => split.paymentStatus === "rejected")
      .length,
  };
}

export function mergeGroupMember(
  group: Group,
  placeholderId: string,
  joinedMemberId: string,
): Group {
  if (placeholderId === joinedMemberId) return group;

  const replace = (memberId: string) =>
    memberId === placeholderId ? joinedMemberId : memberId;

  return {
    ...group,
    adminId: group.adminId ? replace(group.adminId) : group.adminId,
    adminIds: group.adminIds?.map(replace).filter(
      (memberId, index, values) => values.indexOf(memberId) === index,
    ),
    members: group.members.filter((member) => member.id !== placeholderId),
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
          paymentSubmission: split.paymentSubmission
            ? {
                ...split.paymentSubmission,
                reviewedBy: split.paymentSubmission.reviewedBy
                  ? replace(split.paymentSubmission.reviewedBy)
                  : undefined,
              }
            : undefined,
        })),
      };
    }),
    messages: group.messages?.map((message) => ({
      ...message,
      memberId: replace(message.memberId),
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
