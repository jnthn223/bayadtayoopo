import type { Group, Balance, Settlement, Member, Expense } from "./types";

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

export function computeBalances(group: Group): Balance[] {
  const balances: Record<string, number> = {};
  group.members.forEach((m) => (balances[m.id] = 0));

  group.expenses.forEach((exp) => {
    const confirmedPayments = exp.splits.reduce(
      (sum, s) =>
        s.memberId !== exp.paidBy && s.paymentStatus === "confirmed"
          ? sum + s.amount
          : sum,
      0,
    );

    balances[exp.paidBy] += exp.amount - confirmedPayments;
    exp.splits.forEach((s) => {
      if (s.memberId !== exp.paidBy && s.paymentStatus === "confirmed") return;
      balances[s.memberId] -= s.amount;
    });
  });

  return group.members.map((m) => ({
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
  return group.members.find((m) => m.id === id);
}

export function encodeGroupForUrl(group: Group): string {
  return btoa(encodeURIComponent(JSON.stringify(group)));
}

export function decodeGroupFromUrl(encoded: string): Group | null {
  try {
    return JSON.parse(decodeURIComponent(atob(encoded)));
  } catch {
    return null;
  }
}

export function getTotalExpenses(group: Group): number {
  return group.expenses.reduce((sum, e) => sum + e.amount, 0);
}

export const CATEGORY_ICONS: Record<string, string> = {
  food: "🍔",
  transport: "🚗",
  accommodation: "🏨",
  entertainment: "🎬",
  shopping: "🛍️",
  utilities: "💡",
  other: "📦",
};
