import type { Expense, Group } from "./types";

export interface OfflineExpenseOperation {
  id: string;
  type: "upsert-expense";
  userId: string;
  groupId: string;
  expense: Expense;
  groupSeed?: Group;
  queuedAt: string;
}

function key(userId: string) {
  return `bayadtayoopo:expense-outbox:${userId}`;
}

export function loadExpenseOutbox(userId: string): OfflineExpenseOperation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is OfflineExpenseOperation =>
      item && item.type === "upsert-expense" && item.userId === userId &&
      typeof item.id === "string" && typeof item.groupId === "string" &&
      item.expense && typeof item.expense.id === "string",
    );
  } catch {
    return [];
  }
}

export function enqueueExpenseOperation(
  operation: Omit<OfflineExpenseOperation, "id" | "type" | "queuedAt">,
): OfflineExpenseOperation[] {
  const item: OfflineExpenseOperation = {
    ...operation,
    id: `expense:${operation.groupId}:${operation.expense.id}`,
    type: "upsert-expense",
    queuedAt: new Date().toISOString(),
  };
  const next = [
    ...loadExpenseOutbox(operation.userId).filter((candidate) => candidate.id !== item.id),
    item,
  ];
  localStorage.setItem(key(operation.userId), JSON.stringify(next));
  return next;
}

export function removeExpenseOperation(userId: string, operationId: string): OfflineExpenseOperation[] {
  const next = loadExpenseOutbox(userId).filter((item) => item.id !== operationId);
  localStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}
