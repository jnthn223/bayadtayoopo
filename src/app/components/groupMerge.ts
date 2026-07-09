import type { Group } from "./types";

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function mergeById<T extends { id: string }>(
  base: T[] | undefined,
  changed: T[] | undefined,
  latest: T[] | undefined,
): T[] {
  const baseItems = base ?? [];
  const changedItems = changed ?? [];
  let next = [...(latest ?? [])];

  for (const baseItem of baseItems) {
    if (!changedItems.some((item) => item.id === baseItem.id)) {
      next = next.filter((item) => item.id !== baseItem.id);
    }
  }

  for (const changedItem of changedItems) {
    const baseItem = baseItems.find((item) => item.id === changedItem.id);
    if (baseItem && sameValue(baseItem, changedItem)) continue;

    const existingIndex = next.findIndex((item) => item.id === changedItem.id);
    if (existingIndex >= 0) {
      next = next.map((item) =>
        item.id === changedItem.id ? changedItem : item,
      );
    } else {
      next = [changedItem, ...next];
    }
  }

  return next;
}

function mergeAppendOnly<T>(
  base: T[] | undefined,
  changed: T[] | undefined,
  latest: T[] | undefined,
  getKey: (item: T) => string,
): T[] {
  const baseKeys = new Set((base ?? []).map(getKey));
  const latestKeys = new Set((latest ?? []).map(getKey));
  const additions = (changed ?? []).filter((item) => {
    const key = getKey(item);
    return !baseKeys.has(key) && !latestKeys.has(key);
  });

  return [...(latest ?? []), ...additions];
}

export function mergeGroupChanges(
  base: Group | null,
  changed: Group,
  latest: Group,
): Group {
  if (!base) return changed;

  return {
    ...latest,
    name: base.name !== changed.name ? changed.name : latest.name,
    currency:
      base.currency !== changed.currency ? changed.currency : latest.currency,
    adminId: base.adminId !== changed.adminId ? changed.adminId : latest.adminId,
    members: mergeById(base.members, changed.members, latest.members),
    expenses: mergeById(base.expenses, changed.expenses, latest.expenses),
    deletedExpenses: mergeAppendOnly(
      base.deletedExpenses,
      changed.deletedExpenses,
      latest.deletedExpenses,
      (item) => `${item.expenseId}:${item.deletedAt}`,
    ),
    messages: mergeAppendOnly(
      base.messages,
      changed.messages,
      latest.messages,
      (item) => item.id,
    ),
  };
}
