import type {
  Group,
  Balance,
  Settlement,
  Member,
  Expense,
  Split,
  PaymentAllocation,
  BalanceOffset,
  GroupPayment,
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

export function getExpenseContributions(expense: Expense) {
  const contributions = (expense.payerContributions ?? [])
    .filter((item) => item.memberId && Number.isFinite(item.amount) && item.amount > 0.005)
    .map((item) => ({ memberId: item.memberId, amount: Math.round(item.amount * 100) / 100 }));
  return contributions.length > 0
    ? contributions
    : [{ memberId: expense.paidBy, amount: expense.amount }];
}

export function getExpenseContributorIds(expense: Expense): string[] {
  return getExpenseContributions(expense).map((item) => item.memberId);
}

export function getMemberContribution(expense: Expense, memberId: string): number {
  return getExpenseContributions(expense)
    .filter((item) => item.memberId === memberId)
    .reduce((sum, item) => sum + item.amount, 0);
}

export interface ExpenseObligation {
  expenseId: string;
  expenseDescription: string;
  fromMemberId: string;
  toMemberId: string;
  amount: number;
}

/** Match each expense's negative positions to its positive contributor positions in cents. */
export function getExpenseObligations(expense: Expense): ExpenseObligation[] {
  const positions = new Map<string, number>();
  const order: string[] = [];
  const touch = (memberId: string) => {
    if (!positions.has(memberId)) order.push(memberId);
    return positions.get(memberId) ?? 0;
  };
  for (const contribution of getExpenseContributions(expense)) {
    positions.set(
      contribution.memberId,
      touch(contribution.memberId) + Math.round(contribution.amount * 100),
    );
  }
  for (const split of expense.splits) {
    positions.set(
      split.memberId,
      touch(split.memberId) - Math.round(split.amount * 100),
    );
  }

  const debtors = order
    .filter((memberId) => (positions.get(memberId) ?? 0) < 0)
    .map((memberId) => ({ memberId, cents: -(positions.get(memberId) ?? 0) }));
  const creditors = order
    .filter((memberId) => (positions.get(memberId) ?? 0) > 0)
    .map((memberId) => ({ memberId, cents: positions.get(memberId) ?? 0 }));
  const obligations: ExpenseObligation[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const cents = Math.min(debtor.cents, creditor.cents);
    if (cents > 0) {
      obligations.push({
        expenseId: expense.id,
        expenseDescription: expense.description,
        fromMemberId: debtor.memberId,
        toMemberId: creditor.memberId,
        amount: cents / 100,
      });
    }
    debtor.cents -= cents;
    creditor.cents -= cents;
    if (debtor.cents === 0) debtorIndex += 1;
    if (creditor.cents === 0) creditorIndex += 1;
  }
  return obligations;
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

export function canAdminConfirmPayment(
  group: Group,
  payment: GroupPayment,
  member?: Member,
): boolean {
  if (!isGroupAdmin(group, member) || payment.status !== "pending") {
    return false;
  }
  if (payment.toMemberId === member?.id) return false;
  const recipient = getMemberById(group, payment.toMemberId);
  return !recipient?.uid || !!recipient.removedAt;
}

export function canReversePayment(
  group: Group,
  payment: GroupPayment,
  member?: Member,
): boolean {
  if (!member || payment.status !== "confirmed") return false;
  if (
    payment.toMemberId === member.id ||
    (!!member.uid && payment.toMemberId === member.uid)
  ) {
    return true;
  }
  if (!isGroupAdmin(group, member)) return false;
  const recipient = getMemberById(group, payment.toMemberId);
  return !recipient?.uid || !!recipient.removedAt;
}

export function canAdminApproveBalanceOffset(
  group: Group,
  offset: BalanceOffset,
  member?: Member,
): boolean {
  if (!isGroupAdmin(group, member) || offset.status !== "pending") return false;
  if (offset.counterpartyMemberId === member?.id) return false;
  const counterparty = getMemberById(group, offset.counterpartyMemberId);
  return !counterparty?.uid || !!counterparty.removedAt;
}

export function canAdminRecordPaymentBetweenTemporaryMembers(
  group: Group,
  settlement: Settlement,
  member?: Member,
): boolean {
  if (!isGroupAdmin(group, member)) return false;
  const sender = getMemberById(group, settlement.from);
  const recipient = getMemberById(group, settlement.to);
  return (
    !!sender &&
    !!recipient &&
    !sender.uid &&
    !recipient.uid &&
    !sender.removedAt &&
    !recipient.removedAt
  );
}

export function isExpenseSettled(group: Group, expense: Expense): boolean {
  return getExpenseObligations(expense).every((obligation) =>
    !getConfirmedOutstandingExpenseShares(group, obligation.fromMemberId)
      .some(
        (allocation) =>
          allocation.expenseId === expense.id &&
          (allocation.payeeMemberId ?? expense.paidBy) === obligation.toMemberId &&
          allocation.amount > 0.005,
      ),
  );
}

export function canDirectlyConfirmSplit(
  expense: Expense,
  split: Split,
  memberId: string,
): boolean {
  if ((expense.payerContributions?.length ?? 0) > 1) return false;
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
    const reservedSplitStatuses = paymentStatuses.has("pending")
      ? new Set(["pending", "confirmed"])
      : new Set(["confirmed"]);
    for (const contribution of getExpenseContributions(exp)) {
      balances[contribution.memberId] =
        (balances[contribution.memberId] ?? 0) + contribution.amount;
    }
    exp.splits.forEach((s) => {
      balances[s.memberId] = (balances[s.memberId] ?? 0) - s.amount;
      // Legacy per-split confirmations represented a transfer to paidBy.
      if (
        s.memberId !== exp.paidBy &&
        s.paymentStatus &&
        reservedSplitStatuses.has(s.paymentStatus)
      ) {
        balances[s.memberId] += s.amount;
        balances[exp.paidBy] = (balances[exp.paidBy] ?? 0) - s.amount;
      }
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

export interface BalanceDetail {
  id: string;
  label: string;
  amount: number;
  date: string;
  expenseId?: string;
  kind?: "expense-paid" | "expense-share" | "split-payment" | "group-payment";
}

/**
 * Returns the signed entries used to arrive at one member's confirmed balance.
 * Positive entries increase what the member should receive; negative entries
 * increase what they owe.
 */
export function getMemberBalanceDetails(
  group: Group,
  memberId: string,
): BalanceDetail[] {
  const entries: BalanceDetail[] = [];

  for (const expense of group.expenses) {
    const memberSplit = expense.splits.find((split) => split.memberId === memberId);
    const contribution = getMemberContribution(expense, memberId);
    const contributorNames = getExpenseContributions(expense)
      .map((item) => getMemberById(group, item.memberId)?.name ?? "Member")
      .join(" & ");

    if (contribution > 0.005) {
      entries.push({
        id: `expense-paid-${expense.id}`,
        label: `Paid upfront · ${expense.description}`,
        amount: contribution,
        date: expense.date,
        expenseId: expense.id,
        kind: "expense-paid",
      });
    }

    if (memberSplit) {
      entries.push({
        id: `expense-share-${expense.id}`,
        label: `Paid by ${contributorNames} · ${expense.description}`,
        amount: -memberSplit.amount,
        date: expense.date,
        expenseId: expense.id,
        kind: "expense-share",
      });
    }

    for (const split of expense.splits) {
      if (
        split.memberId === expense.paidBy ||
        split.paymentStatus !== "confirmed" ||
        split.amount <= 0.005
      ) {
        continue;
      }

      if (split.memberId === memberId) {
        entries.push({
          id: `split-payment-sent-${expense.id}-${split.memberId}`,
          label: `Confirmed payment sent · ${expense.description}`,
          amount: split.amount,
          date: split.confirmedAt ?? expense.date,
        });
      }
      if (expense.paidBy === memberId) {
        entries.push({
          id: `split-payment-received-${expense.id}-${split.memberId}`,
          label: `Confirmed payment received · ${expense.description}`,
          amount: -split.amount,
          date: split.confirmedAt ?? expense.date,
        });
      }
    }
  }

  for (const payment of group.payments ?? []) {
    if (payment.status !== "confirmed") continue;
    const counterpartyId =
      payment.fromMemberId === memberId
        ? payment.toMemberId
        : payment.toMemberId === memberId
          ? payment.fromMemberId
          : undefined;
    if (!counterpartyId) continue;

    const counterparty = getMemberById(group, counterpartyId)?.name ?? "member";
    const sent = payment.fromMemberId === memberId;
    entries.push({
      id: `group-payment-${payment.id}`,
      label: sent
        ? `Payment sent to ${counterparty}`
        : `Payment received from ${counterparty}`,
      amount: sent ? payment.amount : -payment.amount,
      date: payment.reviewedAt ?? payment.submittedAt,
    });
  }

  return entries.sort((a, b) => b.date.localeCompare(a.date));
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
  return getOutstandingObligationAllocations(
    group,
    fromMemberId,
    new Set(["pending", "confirmed"]),
  );
}

/**
 * Remaining expense shares after completed settlements only.
 * Unlike getOutstandingExpenseShares, a payment that is merely pending is
 * still shown here because the money has not been confirmed yet.
 */
export function getConfirmedOutstandingExpenseShares(
  group: Group,
  fromMemberId: string,
): PaymentAllocation[] {
  return getOutstandingObligationAllocations(
    group,
    fromMemberId,
    new Set(["confirmed"]),
  );
}

function inferredAllocationPayee(
  group: Group,
  allocation: PaymentAllocation,
  fallbackMemberId: string,
) {
  if (allocation.payeeMemberId) return allocation.payeeMemberId;
  const expense = allocation.expenseId
    ? group.expenses.find((candidate) => candidate.id === allocation.expenseId)
    : undefined;
  return expense?.paidBy ?? fallbackMemberId;
}

function outstandingExpensePositions(
  group: Group,
  expense: Expense,
  statuses: Set<"pending" | "confirmed">,
) {
  const positions = new Map<string, number>();
  const order: string[] = [];
  const add = (memberId: string, cents: number) => {
    if (!positions.has(memberId)) order.push(memberId);
    positions.set(memberId, (positions.get(memberId) ?? 0) + cents);
  };
  for (const contribution of getExpenseContributions(expense)) {
    add(contribution.memberId, Math.round(contribution.amount * 100));
  }
  for (const split of expense.splits) {
    add(split.memberId, -Math.round(split.amount * 100));
    if (
      split.memberId !== expense.paidBy &&
      split.paymentStatus &&
      statuses.has(split.paymentStatus as "pending" | "confirmed")
    ) {
      const cents = Math.round(split.amount * 100);
      add(split.memberId, cents);
      add(expense.paidBy, -cents);
    }
  }
  for (const payment of group.payments ?? []) {
    if (!statuses.has(payment.status as "pending" | "confirmed")) continue;
    for (const allocation of payment.allocations ?? []) {
      if (allocation.expenseId !== expense.id) continue;
      const payee = inferredAllocationPayee(group, allocation, payment.toMemberId);
      const cents = Math.round(allocation.amount * 100);
      add(payment.fromMemberId, cents);
      add(payee, -cents);
    }
  }
  for (const offset of group.balanceOffsets ?? []) {
    if (!statuses.has(offset.status as "pending" | "confirmed")) continue;
    const apply = (
      allocations: PaymentAllocation[],
      fromMemberId: string,
      fallbackPayeeId: string,
    ) => {
      for (const allocation of allocations) {
        if (allocation.expenseId !== expense.id) continue;
        const cents = Math.round(allocation.amount * 100);
        add(fromMemberId, cents);
        add(allocation.payeeMemberId ?? fallbackPayeeId, -cents);
      }
    };
    apply(offset.debitAllocations, offset.requesterMemberId, offset.counterpartyMemberId);
    apply(offset.creditAllocations, offset.counterpartyMemberId, offset.requesterMemberId);
  }
  return { positions, order };
}

function matchOutstandingPositions(
  expense: Expense,
  positions: Map<string, number>,
  order: string[],
): ExpenseObligation[] {
  const debtors = order
    .filter((memberId) => (positions.get(memberId) ?? 0) < -0.5)
    .map((memberId) => ({ memberId, cents: -(positions.get(memberId) ?? 0) }));
  const creditors = order
    .filter((memberId) => (positions.get(memberId) ?? 0) > 0.5)
    .map((memberId) => ({ memberId, cents: positions.get(memberId) ?? 0 }));
  const obligations: ExpenseObligation[] = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const cents = Math.min(debtor.cents, creditor.cents);
    if (cents > 0) obligations.push({
      expenseId: expense.id,
      expenseDescription: expense.description,
      fromMemberId: debtor.memberId,
      toMemberId: creditor.memberId,
      amount: cents / 100,
    });
    debtor.cents -= cents;
    creditor.cents -= cents;
    if (debtor.cents === 0) debtorIndex += 1;
    if (creditor.cents === 0) creditorIndex += 1;
  }
  return obligations;
}

export function getExpensePayeeOptions(
  group: Group,
  fromMemberId: string,
): PaymentAllocation[] {
  const statuses = new Set<"pending" | "confirmed">(["pending", "confirmed"]);
  return [...group.expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .flatMap((expense) => {
      const { positions } = outstandingExpensePositions(group, expense, statuses);
      const debtorCents = Math.max(0, -(positions.get(fromMemberId) ?? 0));
      if (debtorCents === 0) return [];
      return getExpenseContributorIds(expense).flatMap((payeeMemberId) => {
        const creditorCents = Math.max(0, positions.get(payeeMemberId) ?? 0);
        if (payeeMemberId === fromMemberId || creditorCents === 0) return [];
        return [{
          expenseId: expense.id,
          expenseDescription: expense.description,
          ...(expense.payerContributions?.length ? { payeeMemberId } : {}),
          amount: Math.min(debtorCents, creditorCents) / 100,
        }];
      });
    });
}

function getOutstandingObligationAllocations(
  group: Group,
  fromMemberId: string,
  statuses: Set<"pending" | "confirmed">,
): PaymentAllocation[] {
  return [...group.expenses]
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .flatMap((expense) => {
      const { positions, order } = outstandingExpensePositions(group, expense, statuses);
      return matchOutstandingPositions(expense, positions, order)
        .filter((obligation) => obligation.fromMemberId === fromMemberId)
        .map((obligation) => ({
                expenseId: expense.id,
                expenseDescription: expense.description,
                ...(expense.payerContributions?.length
                  ? { payeeMemberId: obligation.toMemberId }
                  : {}),
                amount: obligation.amount,
              }));
    });
}

export function computeDirectExpenseSettlements(group: Group): Settlement[] {
  const settlements = new Map<string, Settlement>();
  for (const sender of group.members) {
    if (sender.removedAt) continue;
    for (const share of getOutstandingExpenseShares(group, sender.id)) {
      if (!share.expenseId) continue;
      const expense = group.expenses.find(
        (candidate) => candidate.id === share.expenseId,
      );
      if (!expense) continue;
      const recipient = share.payeeMemberId
        ? getMemberById(group, share.payeeMemberId)
        : getMemberById(group, getExpensePayerId(expense));
      if (!recipient || recipient.removedAt || recipient.id === sender.id) continue;
      const key = `${sender.id}:${recipient.id}`;
      const existing = settlements.get(key);
      settlements.set(key, {
        from: sender.id,
        fromName: sender.name,
        to: recipient.id,
        toName: recipient.name,
        amount: Math.round(((existing?.amount ?? 0) + share.amount) * 100) / 100,
      });
    }
  }
  return [...settlements.values()];
}

function directOutstandingShares(
  group: Group,
  debtorMemberId: string,
  creditorMemberId: string,
): PaymentAllocation[] {
  return getOutstandingExpenseShares(group, debtorMemberId).filter(
    (share) => {
      const expense = group.expenses.find((item) => item.id === share.expenseId);
      return expense && (share.payeeMemberId ?? getExpensePayerId(expense)) === creditorMemberId;
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
  recipientMemberId?: string,
): PaymentAllocation[] {
  let remainingCents = Math.max(0, Math.round(amount * 100));
  if (remainingCents === 0) return [];

  const selectedIds = selectedExpenseIds
    ? new Set(selectedExpenseIds)
    : undefined;
  const sourceShares = recipientMemberId && selectedIds
    ? getExpensePayeeOptions(group, fromMemberId)
    : getOutstandingExpenseShares(group, fromMemberId);
  const outstandingShares = sourceShares.filter(
    (allocation) => {
      if (!allocation.expenseId) return false;
      if (selectedIds && !selectedIds.has(allocation.expenseId)) return false;
      if (!recipientMemberId) return true;
      const expense = group.expenses.find(
        (candidate) => candidate.id === allocation.expenseId,
      );
      return !!expense && (allocation.payeeMemberId ?? getExpensePayerId(expense)) === recipientMemberId;
    },
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
  if (group.kind === "direct" && group.directStatus !== "active") return 0;
  return group.expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Remaining net amount that still needs to move after confirmed payments. */
export function getUnsettledTotal(
  group: Group,
  options: { includeProvisionalDirect?: boolean } = {},
): number {
  const accountingGroup =
    options.includeProvisionalDirect &&
    group.kind === "direct" &&
    group.directStatus !== "active"
      ? { ...group, directStatus: "active" as const }
      : group;
  return Math.round(
    computeSettlements(computeBalances(accountingGroup)).reduce(
      (sum, settlement) => sum + settlement.amount,
      0,
    ) * 100,
  ) / 100;
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
  const destinationMember = group.members.find(
    (member) => member.id === destinationMemberId,
  );
  const isPendingMemberClaim = !sourceMember?.uid && !!destinationMember?.uid;
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
    members: group.members
      .filter((member) => member.id !== sourceMemberId)
      .map((member) =>
        member.id === destinationMemberId && isPendingMemberClaim
          ? { ...member, claimedFromPlaceholder: true }
          : member,
      ),
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

      const combinedContributions = new Map<string, number>();
      for (const contribution of expense.payerContributions ?? []) {
        const memberId = replace(contribution.memberId);
        combinedContributions.set(
          memberId,
          (combinedContributions.get(memberId) ?? 0) + contribution.amount,
        );
      }

      return {
        ...expense,
        paidBy: replace(expense.paidBy),
        payerContributions: expense.payerContributions
          ? [...combinedContributions].map(([memberId, amount]) => ({ memberId, amount }))
          : undefined,
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
      allocations: payment.allocations?.map((allocation) => ({
        ...allocation,
        payeeMemberId: allocation.payeeMemberId
          ? replace(allocation.payeeMemberId)
          : undefined,
      })),
      fromMemberId: replace(payment.fromMemberId),
      toMemberId: replace(payment.toMemberId),
      submittedBy: replace(payment.submittedBy),
      reviewedBy: payment.reviewedBy
        ? replace(payment.reviewedBy)
        : undefined,
      reviewedOnBehalfOfMemberId: payment.reviewedOnBehalfOfMemberId
        ? replace(payment.reviewedOnBehalfOfMemberId)
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
      debitAllocations: offset.debitAllocations.map((allocation) => ({
        ...allocation,
        payeeMemberId: allocation.payeeMemberId
          ? replace(allocation.payeeMemberId)
          : undefined,
      })),
      creditAllocations: offset.creditAllocations.map((allocation) => ({
        ...allocation,
        payeeMemberId: allocation.payeeMemberId
          ? replace(allocation.payeeMemberId)
          : undefined,
      })),
      requesterMemberId: replace(offset.requesterMemberId),
      counterpartyMemberId: replace(offset.counterpartyMemberId),
      requestedBy: replace(offset.requestedBy),
      reviewedBy: offset.reviewedBy ? replace(offset.reviewedBy) : undefined,
      reviewedOnBehalfOfMemberId: offset.reviewedOnBehalfOfMemberId
        ? replace(offset.reviewedOnBehalfOfMemberId)
        : undefined,
      cancelledBy: offset.cancelledBy
        ? replace(offset.cancelledBy)
        : undefined,
    })),
    paymentSchedules: group.paymentSchedules?.map((schedule) => ({
      ...schedule,
      payeeMemberId: replace(schedule.payeeMemberId),
      debtorMemberId: replace(schedule.debtorMemberId),
      createdBy: replace(schedule.createdBy),
      proposedBy: schedule.proposedBy ? replace(schedule.proposedBy) : undefined,
      awaitingMemberId: schedule.awaitingMemberId
        ? replace(schedule.awaitingMemberId)
        : undefined,
      respondedBy: schedule.respondedBy
        ? replace(schedule.respondedBy)
        : undefined,
      activity: schedule.activity.map((item) => ({
        ...item,
        actorMemberId: replace(item.actorMemberId),
      })),
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
  drinks: "🥤",
  groceries: "🛒",
  transport: "🚗",
  accommodation: "🏨",
  activities: "🎟️",
  entertainment: "🎬",
  shopping: "🛍️",
  utilities: "💡",
  other: "📦",
  // Preserve the icon for existing expenses created under the former Trip category.
  trip: "🧳",
};
