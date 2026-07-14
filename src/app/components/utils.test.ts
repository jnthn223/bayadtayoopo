import { describe, expect, it } from "vitest";
import type { Group } from "./types";
import {
  allocateCustomShares,
  archiveGroupMember,
  canDirectlyConfirmSplit,
  computeBalances,
  computeSettlements,
  formatCurrency,
  getCurrencySymbol,
  getMemberById,
  getTotalExpenses,
  getUnsettledPaymentSummary,
  mergeGroupMember,
} from "./utils";

const group: Group = {
  id: "group-1",
  name: "Trip",
  adminId: "alice",
  createdAt: "2026-01-01T00:00:00.000Z",
  currency: "PHP",
  members: [
    { id: "alice", uid: "alice", name: "Alice", color: "#111111" },
    { id: "bob", uid: "bob", name: "Bob", color: "#222222" },
    { id: "carol", uid: "carol", name: "Carol", color: "#333333" },
  ],
  expenses: [
    {
      id: "expense-1",
      description: "Dinner",
      amount: 90,
      paidBy: "alice",
      createdBy: "alice",
      splitType: "equal",
      category: "food",
      date: "2026-01-02T00:00:00.000Z",
      splits: [
        { memberId: "alice", amount: 30 },
        { memberId: "bob", amount: 30 },
        { memberId: "carol", amount: 30 },
      ],
    },
    {
      id: "expense-2",
      description: "Taxi",
      amount: 60,
      paidBy: "bob",
      createdBy: "bob",
      splitType: "equal",
      category: "transport",
      date: "2026-01-03T00:00:00.000Z",
      splits: [
        { memberId: "alice", amount: 20, paymentStatus: "confirmed" },
        { memberId: "bob", amount: 20 },
        { memberId: "carol", amount: 20, paymentStatus: "pending" },
      ],
    },
  ],
};

describe("expense business logic", () => {
  it("redistributes the remaining custom amount across non-fixed members", () => {
    expect(
      allocateCustomShares(
        ["you", "christian", "fitz", "lara", "angelica", "djulliane"],
        1998,
        { christian: 700 },
      ),
    ).toEqual({
      christian: 700,
      you: 259.6,
      fitz: 259.6,
      lara: 259.6,
      angelica: 259.6,
      djulliane: 259.6,
    });

    expect(
      allocateCustomShares(
        ["you", "christian", "fitz", "lara", "angelica", "djulliane"],
        1998,
        { christian: 700, fitz: 300 },
      ),
    ).toEqual({
      christian: 700,
      fitz: 300,
      you: 249.5,
      lara: 249.5,
      angelica: 249.5,
      djulliane: 249.5,
    });
  });

  it("allocates only among included members and keeps cent totals exact", () => {
    const allocation = allocateCustomShares(["you", "christian", "fitz"], 10, {
      christian: 3,
    });
    expect(allocation).toEqual({ christian: 3, you: 3.5, fitz: 3.5 });
    expect(Object.values(allocation).reduce((sum, amount) => sum + amount, 0)).toBe(10);
  });

  it("computes balances and excludes confirmed repayments from outstanding debt", () => {
    expect(computeBalances(group)).toEqual([
      { memberId: "alice", memberName: "Alice", net: 60 },
      { memberId: "bob", memberName: "Bob", net: -10 },
      { memberId: "carol", memberName: "Carol", net: -50 },
    ]);
  });

  it("computes settlements from debtor and creditor balances", () => {
    expect(
      computeSettlements([
        { memberId: "alice", memberName: "Alice", net: 60 },
        { memberId: "bob", memberName: "Bob", net: -10 },
        { memberId: "carol", memberName: "Carol", net: -50 },
      ]),
    ).toEqual([
      {
        from: "bob",
        fromName: "Bob",
        to: "alice",
        toName: "Alice",
        amount: 10,
      },
      {
        from: "carol",
        fromName: "Carol",
        to: "alice",
        toName: "Alice",
        amount: 50,
      },
    ]);
  });

  it("rounds settlement amounts to currency precision", () => {
    expect(
      computeSettlements([
        { memberId: "alice", memberName: "Alice", net: 10.005 },
        { memberId: "bob", memberName: "Bob", net: -10.005 },
      ]),
    ).toEqual([
      {
        from: "bob",
        fromName: "Bob",
        to: "alice",
        toName: "Alice",
        amount: 10.01,
      },
    ]);
  });

  it("formats currency and falls back to the currency code when Intl rejects it", () => {
    expect(formatCurrency(1234.5, "USD")).toBe("$1,234.50");
    expect(getCurrencySymbol("INVALID")).toBe("INVALID");
  });

  it("finds members and totals expenses", () => {
    expect(getMemberById(group, "bob")?.name).toBe("Bob");
    expect(getMemberById(group, "missing")).toBeUndefined();
    expect(getTotalExpenses(group)).toBe(150);
  });

  it("archives a removed member while keeping historical expense identity and balances", () => {
    const archived = archiveGroupMember(
      { ...group, adminIds: ["alice", "bob"] },
      "bob",
    );

    expect(archived.members.map((member) => member.id)).toEqual([
      "alice",
      "carol",
    ]);
    expect(archived.adminIds).toEqual(["alice"]);
    expect(getMemberById(archived, "bob")?.name).toBe("Bob");
    expect(archived.expenses).toEqual(group.expenses);
    expect(computeBalances(archived).find((balance) => balance.memberId === "bob"))
      .toMatchObject({ memberName: "Bob", net: -10 });
  });

  it("summarizes only the current member's unconfirmed repayments", () => {
    expect(getUnsettledPaymentSummary(group, "carol")).toEqual({
      count: 2,
      amount: 50,
      pendingCount: 1,
      rejectedCount: 0,
    });
    expect(getUnsettledPaymentSummary(group, "alice")).toEqual({
      count: 0,
      amount: 0,
      pendingCount: 0,
      rejectedCount: 0,
    });
  });

  it("respects the payer selected when an admin records an expense", () => {
    const createdForAnotherPayer: Group = {
      ...group,
      expenses: [
        {
          ...group.expenses[0],
          paidBy: "alice",
          createdBy: "bob",
          splits: [
            { memberId: "alice", amount: 30 },
            { memberId: "bob", amount: 30 },
            { memberId: "carol", amount: 30 },
          ],
        },
      ],
    };

    expect(computeBalances(createdForAnotherPayer)).toEqual([
      { memberId: "alice", memberName: "Alice", net: 60 },
      { memberId: "bob", memberName: "Bob", net: -30 },
      { memberId: "carol", memberName: "Carol", net: -30 },
    ]);
    expect(getUnsettledPaymentSummary(createdForAnotherPayer, "bob")).toEqual({
      count: 1,
      amount: 30,
      pendingCount: 0,
      rejectedCount: 0,
    });

    const expense = createdForAnotherPayer.expenses[0];
    const borrowerSplit = expense.splits.find(
      (split) => split.memberId === "carol",
    )!;
    expect(canDirectlyConfirmSplit(expense, borrowerSplit, "alice")).toBe(true);
    expect(canDirectlyConfirmSplit(expense, borrowerSplit, "carol")).toBe(false);

    expect(
      canDirectlyConfirmSplit(
        expense,
        { ...borrowerSplit, paymentStatus: "pending" },
        "alice",
      ),
    ).toBe(false);
  });

  it("assigns an admin-recorded expense to the member who actually paid", () => {
    const pizzaParty: Group = {
      ...group,
      members: [
        { id: "you", uid: "you", name: "You", color: "#111111" },
        { id: "christian", uid: "christian", name: "Christian", color: "#222222" },
        { id: "fitz", uid: "fitz", name: "Fitz", color: "#333333" },
      ],
      expenses: [
        {
          id: "pizza",
          description: "Pizza Party",
          amount: 1998,
          paidBy: "christian",
          createdBy: "you",
          splitType: "custom",
          category: "food",
          date: "2026-01-04",
          splits: [
            { memberId: "you", amount: 649 },
            { memberId: "christian", amount: 700 },
            { memberId: "fitz", amount: 649 },
          ],
        },
      ],
    };

    expect(computeBalances(pizzaParty)).toEqual([
      { memberId: "you", memberName: "You", net: -649 },
      { memberId: "christian", memberName: "Christian", net: 1298 },
      { memberId: "fitz", memberName: "Fitz", net: -649 },
    ]);
  });

  it("merges a placeholder into a joined member without losing expense amounts", () => {
    const withPlaceholder: Group = {
      ...group,
      members: [
        ...group.members,
        { id: "nathan-placeholder", name: "Nathan", color: "#444444" },
        { id: "nate-account", uid: "nate-uid", name: "Nate", color: "#555555" },
      ],
      expenses: [
        {
          ...group.expenses[0],
          paidBy: "nathan-placeholder",
          splits: [
            { memberId: "alice", amount: 30 },
            { memberId: "nathan-placeholder", amount: 30 },
            { memberId: "nate-account", amount: 30 },
          ],
        },
      ],
      messages: [
        {
          id: "message-1",
          memberId: "nathan-placeholder",
          text: "Hello",
          createdAt: "2026-01-01T00:00:00.000Z",
        },
      ],
    };

    const merged = mergeGroupMember(
      withPlaceholder,
      "nathan-placeholder",
      "nate-account",
    );

    expect(merged.members.some((member) => member.id === "nathan-placeholder"))
      .toBe(false);
    expect(merged.expenses[0].paidBy).toBe("nate-account");
    expect(
      merged.expenses[0].splits.find((split) => split.memberId === "nate-account")
        ?.amount,
    ).toBe(60);
    expect(merged.messages?.[0].memberId).toBe("nate-account");
  });
});
