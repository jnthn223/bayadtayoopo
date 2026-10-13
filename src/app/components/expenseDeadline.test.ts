import { describe, expect, it } from "vitest";
import { getExpenseDeadlineState } from "./expenseDeadline";

describe("expense deadlines", () => {
  const now = new Date(2026, 9, 13, 12);

  it("labels due and overdue dates", () => {
    expect(getExpenseDeadlineState("2026-10-13", now)?.label).toBe("Due today");
    expect(getExpenseDeadlineState("2026-10-14", now)?.label).toBe("Due tomorrow");
    expect(getExpenseDeadlineState("2026-10-10", now)?.label).toBe("Overdue by 3 days");
  });
});
