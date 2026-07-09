import type { Group } from "./types";

const MAX_GROUP_MESSAGES = 200;
const MAX_DELETED_EXPENSES = 100;

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function timeValue(value: string): number {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
}

function latestByTimestamp<T>(
  items: T[] | undefined,
  limit: number,
  getTimestamp: (item: T) => string,
): T[] | undefined {
  if (!items) return undefined;

  return [...items]
    .sort((a, b) => timeValue(getTimestamp(a)) - timeValue(getTimestamp(b)))
    .slice(-limit);
}

export function compactGroupHistory(group: Group): Group {
  return {
    ...group,
    deletedExpenses: latestByTimestamp(
      group.deletedExpenses,
      MAX_DELETED_EXPENSES,
      (item) => item.deletedAt,
    ),
    messages: latestByTimestamp(
      group.messages,
      MAX_GROUP_MESSAGES,
      (item) => item.createdAt,
    ),
  };
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
  if (!base) return compactGroupHistory(changed);

  return compactGroupHistory({
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
  });
}
