import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueExpenseOperation, loadExpenseOutbox, removeExpenseOperation } from "./offlineExpenseOutbox";
import type { Expense } from "./types";

const values = new Map<string, string>();
vi.stubGlobal("localStorage", {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => values.set(key, value),
});

const expense: Expense = {
  id: "expense-1", description: "Lunch", amount: 100, paidBy: "me", createdBy: "me",
  splitType: "equal", splits: [{ memberId: "me", amount: 50 }, { memberId: "friend", amount: 50 }],
  date: "2026-10-28", category: "food", createdAt: "2026-10-28T01:00:00.000Z",
};

describe("offline expense outbox", () => {
  beforeEach(() => values.clear());

  it("uses a stable operation id so retries cannot duplicate an expense", () => {
    enqueueExpenseOperation({ userId: "me", groupId: "group", expense });
    enqueueExpenseOperation({ userId: "me", groupId: "group", expense: { ...expense, description: "Updated lunch" } });
    expect(loadExpenseOutbox("me")).toHaveLength(1);
    expect(loadExpenseOutbox("me")[0]).toMatchObject({
      id: "expense:group:expense-1",
      expense: { description: "Updated lunch" },
    });
    removeExpenseOperation("me", "expense:group:expense-1");
    expect(loadExpenseOutbox("me")).toEqual([]);
  });
});
