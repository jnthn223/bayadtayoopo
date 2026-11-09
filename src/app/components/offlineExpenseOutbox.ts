import type { Expense, Group } from "./types";

export interface OfflineExpenseOperation {
  id: string;
  type: "upsert-expense";
  userId: string;
  groupId: string;
  expense: Expense;
  groupSeed?: Group;
  queuedAt: string;
  status: "pending" | "failed" | "conflict";
  attemptCount: number;
  lastAttemptAt?: string;
  lastError?: string;
  /** Set only after the user explicitly chooses their local copy during a conflict. */
  forceOverwrite?: boolean;
}

function key(userId: string) {
  return `bayadtayoopo:expense-outbox:${userId}`;
}

export function loadExpenseOutbox(userId: string): OfflineExpenseOperation[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(key(userId)) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item) =>
      item && item.type === "upsert-expense" && item.userId === userId &&
      typeof item.id === "string" && typeof item.groupId === "string" &&
      item.expense && typeof item.expense.id === "string",
    ).map((item) => ({
      ...item,
      status: ["pending", "failed", "conflict"].includes(item.status)
        ? item.status
        : "pending",
      attemptCount: Number.isFinite(item.attemptCount) ? item.attemptCount : 0,
    })) as OfflineExpenseOperation[];
  } catch {
    return [];
  }
}

export function enqueueExpenseOperation(
  operation: Omit<
    OfflineExpenseOperation,
    "id" | "type" | "queuedAt" | "status" | "attemptCount" | "lastAttemptAt" | "lastError" | "forceOverwrite"
  >,
): OfflineExpenseOperation[] {
  const existing = loadExpenseOutbox(operation.userId).find(
    (candidate) => candidate.id === `expense:${operation.groupId}:${operation.expense.id}`,
  );
  const item: OfflineExpenseOperation = {
    ...operation,
    groupSeed: operation.groupSeed ?? existing?.groupSeed,
    id: `expense:${operation.groupId}:${operation.expense.id}`,
    type: "upsert-expense",
    queuedAt: new Date().toISOString(),
    status: "pending",
    attemptCount: 0,
  };
  const next = [
    ...loadExpenseOutbox(operation.userId).filter((candidate) => candidate.id !== item.id),
    item,
  ];
  localStorage.setItem(key(operation.userId), JSON.stringify(next));
  return next;
}

export function updateExpenseOperation(
  userId: string,
  operationId: string,
  update: Partial<Pick<OfflineExpenseOperation, "status" | "attemptCount" | "lastAttemptAt" | "lastError" | "forceOverwrite">>,
): OfflineExpenseOperation[] {
  const next = loadExpenseOutbox(userId).map((item) =>
    item.id === operationId ? { ...item, ...update } : item,
  );
  localStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}

export function retryExpenseOperation(userId: string, operationId: string): OfflineExpenseOperation[] {
  const existing = loadExpenseOutbox(userId).find((item) => item.id === operationId);
  return updateExpenseOperation(userId, operationId, {
    status: "pending",
    attemptCount: 0,
    lastAttemptAt: undefined,
    lastError: undefined,
    forceOverwrite: existing?.status === "conflict",
  });
}

export function removeExpenseOperation(userId: string, operationId: string): OfflineExpenseOperation[] {
  const next = loadExpenseOutbox(userId).filter((item) => item.id !== operationId);
  localStorage.setItem(key(userId), JSON.stringify(next));
  return next;
}
