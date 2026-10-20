import type { ExpenseItem } from "./types";

/** Allocate every item in cents so member totals always reconcile exactly. */
export function allocateItemizedShares(items: ExpenseItem[]): Record<string, number> {
  const centsByMember: Record<string, number> = {};

  for (const item of items) {
    const memberIds = [...new Set(item.memberIds)];
    if (memberIds.length === 0) continue;
    const cents = Math.round(item.amount * 100);
    const base = Math.floor(cents / memberIds.length);
    let remainder = cents - base * memberIds.length;
    memberIds.forEach((memberId) => {
      const share = base + (remainder > 0 ? 1 : 0);
      remainder = Math.max(0, remainder - 1);
      centsByMember[memberId] = (centsByMember[memberId] ?? 0) + share;
    });
  }

  return Object.fromEntries(
    Object.entries(centsByMember).map(([memberId, cents]) => [memberId, cents / 100]),
  );
}

export function itemizedTotal(items: ExpenseItem[]): number {
  return Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100;
}

/** Return one member's exact cent-safe allocation for a single item. */
export function getItemizedMemberAmount(
  item: ExpenseItem,
  memberId: string,
): number {
  const memberIds = [...new Set(item.memberIds)];
  const memberIndex = memberIds.indexOf(memberId);
  if (memberIndex < 0 || memberIds.length === 0) return 0;

  const cents = Math.round(item.amount * 100);
  const base = Math.floor(cents / memberIds.length);
  const remainder = cents - base * memberIds.length;
  return (base + (memberIndex < remainder ? 1 : 0)) / 100;
}
