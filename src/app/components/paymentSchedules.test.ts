import { describe, expect, it } from "vitest";
import type { Group } from "./types";
import {
  coveredByOpenSchedule,
  createPaymentSchedule,
  directSharesOwedTo,
} from "./paymentSchedules";

const group: Group = {
  id: "group",
  name: "Trip",
  currency: "PHP",
  createdAt: "2026-10-15T00:00:00.000Z",
  members: [
    { id: "payee", name: "Alex", color: "#000" },
    { id: "debtor", name: "Sam", color: "#111" },
  ],
  expenses: [
    {
      id: "hotel",
      description: "Hotel",
      amount: 1000,
      paidBy: "payee",
      splitType: "custom",
      splits: [
        { memberId: "payee", amount: 500 },
        { memberId: "debtor", amount: 500 },
      ],
      date: "2026-10-15",
      category: "accommodation",
    },
  ],
};

describe("payment schedules", () => {
  it("only offers expense shares owed directly to the payee", () => {
    expect(directSharesOwedTo(group, "debtor", "payee")).toEqual([
      { expenseId: "hotel", expenseDescription: "Hotel", amount: 500 },
    ]);
  });

  it("snapshots selected expense shares and marks them unavailable", () => {
    const schedule = createPaymentSchedule({
      payeeMemberId: "payee",
      debtorMemberId: "debtor",
      shares: directSharesOwedTo(group, "debtor", "payee"),
      selectedExpenseIds: ["hotel"],
      installmentAmount: 100,
      frequency: "monthly",
      firstPaymentDate: "2026-11-15",
      now: "2026-10-15T01:00:00.000Z",
    });
    expect(schedule.coverage).toEqual([
      { expenseId: "hotel", expenseDescription: "Hotel", amount: 500 },
    ]);
    expect(schedule.awaitingMemberId).toBe("debtor");
    expect(coveredByOpenSchedule({ ...group, paymentSchedules: [schedule] })).toContain("debtor:hotel");
  });

  it("rejects an installment above the covered balance", () => {
    expect(() => createPaymentSchedule({
      payeeMemberId: "payee",
      debtorMemberId: "debtor",
      shares: directSharesOwedTo(group, "debtor", "payee"),
      selectedExpenseIds: ["hotel"],
      installmentAmount: 501,
      frequency: "monthly",
      firstPaymentDate: "2026-11-15",
    })).toThrow("covered balance");
  });
});
