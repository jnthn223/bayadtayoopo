import { describe, expect, it } from "vitest";
import type { CurrentUser, Group } from "./types";
import {
  buildQuickExpense,
  isQuickAddPath,
  resolveQuickAddGroupId,
  upsertExpense,
} from "./quickAddExpense";

const user: CurrentUser = {
  id: "alice-uid",
  name: "Alice",
  email: "alice@example.com",
  color: "#111",
};

function group(id: string, accessible = true): Group {
  return {
    id,
    name: id,
    members: accessible
      ? [
          { id: "alice-member", uid: "alice-uid", name: "Alice", color: "#111" },
          { id: "bob", uid: "bob-uid", name: "Bob", color: "#222" },
          { id: "cara", name: "Cara", color: "#333" },
        ]
      : [{ id: "bob", uid: "bob-uid", name: "Bob", color: "#222" }],
    expenses: [],
    createdAt: "2026-09-01T00:00:00.000Z",
    currency: "PHP",
  };
}

describe("quick expense entry", () => {
  it("recognizes the dedicated route with an optional trailing slash", () => {
    expect(isQuickAddPath("/quick-add")).toBe(true);
    expect(isQuickAddPath("/quick-add/")).toBe(true);
    expect(isQuickAddPath("/")).toBe(false);
  });

  it("prioritizes URL group, then remembered group, then the first accessible group", () => {
    const groups = [group("first"), group("remembered"), group("url")];
    expect(resolveQuickAddGroupId(groups, user.id, "url", "remembered")).toBe("url");
    expect(resolveQuickAddGroupId(groups, user.id, "missing", "remembered")).toBe("remembered");
    expect(resolveQuickAddGroupId(groups, user.id, "missing", "also-missing")).toBe("first");
  });

  it("does not select a group the user cannot access", () => {
    expect(
      resolveQuickAddGroupId(
        [group("inaccessible", false), group("available")],
        user.id,
        "inaccessible",
        null,
      ),
    ).toBe("available");
  });

  it("creates an equal expense paid by the signed-in member", () => {
    const expense = buildQuickExpense({
      group: group("trip"),
      currentUser: user,
      amount: 100,
      description: "  Taxi  ",
      id: "expense-1",
      now: new Date("2026-09-03T05:30:00.000Z"),
    });

    expect(expense).toMatchObject({
      id: "expense-1",
      description: "Taxi",
      amount: 100,
      paidBy: "alice-member",
      createdBy: "alice-member",
      splitType: "equal",
      category: "other",
      date: "2026-09-03",
    });
    expect(expense.splits.map((split) => split.amount)).toEqual([33.34, 33.33, 33.33]);
  });

  it("supports selecting members, custom shares, and an admin-selected payer", () => {
    const trip = { ...group("trip"), adminId: "alice-member" };
    const expense = buildQuickExpense({
      group: trip,
      currentUser: user,
      amount: 100,
      description: "Tickets",
      paidByMemberId: "bob",
      includedMemberIds: ["bob", "cara"],
      splitType: "custom",
      customAmounts: { bob: 25, cara: 75 },
      id: "expense-custom",
    });

    expect(expense.paidBy).toBe("bob");
    expect(expense.splitType).toBe("custom");
    expect(expense.splits).toEqual([
      { memberId: "bob", amount: 25 },
      { memberId: "cara", amount: 75 },
    ]);
  });

  it("prevents non-admins from assigning another payer", () => {
    expect(() =>
      buildQuickExpense({
        group: { ...group("trip"), adminId: "bob" },
        currentUser: user,
        amount: 100,
        description: "Tickets",
        paidByMemberId: "bob",
      }),
    ).toThrow("Only an admin");
  });

  it("rejects a custom split that does not match the total", () => {
    expect(() =>
      buildQuickExpense({
        group: group("trip"),
        currentUser: user,
        amount: 100,
        description: "Tickets",
        includedMemberIds: ["alice-member", "bob"],
        splitType: "custom",
        customAmounts: { "alice-member": 40, bob: 40 },
      }),
    ).toThrow("Custom shares must equal");
  });

  it("rejects negative custom shares", () => {
    expect(() =>
      buildQuickExpense({
        group: group("trip"),
        currentUser: user,
        amount: 100,
        description: "Tickets",
        includedMemberIds: ["alice-member", "bob"],
        splitType: "custom",
        customAmounts: { "alice-member": -10, bob: 110 },
      }),
    ).toThrow("non-negative");
  });

  it("inserts and replaces expenses without mutating the group", () => {
    const original = group("trip");
    const expense = buildQuickExpense({
      group: original,
      currentUser: user,
      amount: 90,
      description: "Lunch",
      id: "expense-1",
    });
    const inserted = upsertExpense(original, expense);
    const changed = { ...expense, description: "Late lunch" };
    const replaced = upsertExpense(inserted, changed);

    expect(original.expenses).toEqual([]);
    expect(inserted.expenses).toEqual([expense]);
    expect(replaced.expenses).toEqual([changed]);
  });
});
