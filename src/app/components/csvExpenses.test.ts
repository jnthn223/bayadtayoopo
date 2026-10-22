import { describe, expect, it, vi } from "vitest";
import type { Group } from "./types";
import {
  exportExpensesCsv,
  exportExpensesTemplateCsv,
  parseExpensesCsv,
} from "./csvExpenses";

vi.mock("./utils", async () => {
  const actual = await vi.importActual<typeof import("./utils")>("./utils");
  return { ...actual, generateId: () => "imported-id" };
});

const group: Group = {
  id: "group-1",
  name: "Beach Trip",
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
      description: "Dinner, seafood",
      notes: "Birthday dinner, including tip",
      amount: 900,
      paidBy: "alice",
      createdBy: "alice",
      splitType: "equal",
      category: "food",
      date: "2026-07-10",
      splits: [
        { memberId: "alice", amount: 300 },
        { memberId: "bob", amount: 300 },
        { memberId: "carol", amount: 300 },
      ],
    },
  ],
};

describe("CSV expense tools", () => {
  it("exports expenses with quoted CSV fields when needed", () => {
    expect(exportExpensesCsv(group)).toContain('"Dinner, seafood"');
    expect(exportExpensesCsv(group)).toContain('"Birthday dinner, including tip"');
    expect(exportExpensesCsv(group)).toContain("Alice:300;Bob:300;Carol:300");
  });

  it("imports exported expenses back into expense records", () => {
    const result = parseExpensesCsv(
      exportExpensesCsv(group),
      { ...group, expenses: [] },
      "alice",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.expenses).toEqual([
      {
        ...group.expenses[0],
        id: "imported-id",
        createdBy: "alice",
        createdAt: expect.any(String),
      },
    ]);
  });

  it("round-trips itemized expenses, deadlines, and locked currency details", () => {
    const itemizedGroup: Group = {
      ...group,
      expenses: [
        {
          id: "expense-itemized",
          description: "Tokyo dinner",
          amount: 920,
          originalAmount: 2400,
          originalCurrency: "JPY",
          conversionRate: 920 / 2400,
          conversionRateDate: "2026-07-10",
          conversionSource: "manual",
          paidBy: "alice",
          createdBy: "alice",
          splitType: "itemized",
          category: "food",
          date: "2026-07-10",
          dueDate: "2026-07-20",
          splits: [
            { memberId: "alice", amount: 460 },
            { memberId: "bob", amount: 460 },
          ],
          items: [
            {
              id: "ramen",
              name: "Ramen",
              amount: 300,
              memberIds: ["alice"],
            },
            {
              id: "gyoza",
              name: "Shared gyoza",
              amount: 320,
              memberIds: ["alice", "bob"],
            },
            {
              id: "dessert",
              name: "Dessert",
              amount: 300,
              memberIds: ["bob"],
            },
          ],
        },
      ],
    };

    const result = parseExpensesCsv(
      exportExpensesCsv(itemizedGroup),
      { ...group, expenses: [] },
      "alice",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expenses[0]).toMatchObject({
      description: "Tokyo dinner",
      amount: 920,
      originalAmount: 2400,
      originalCurrency: "JPY",
      conversionRate: 920 / 2400,
      conversionRateDate: "2026-07-10",
      conversionSource: "manual",
      dueDate: "2026-07-20",
      splitType: "itemized",
      splits: [
        { memberId: "alice", amount: 460 },
        { memberId: "bob", amount: 460 },
      ],
      items: [
        { name: "Ramen", amount: 300, memberIds: ["alice"] },
        { name: "Shared gyoza", amount: 320, memberIds: ["alice", "bob"] },
        { name: "Dessert", amount: 300, memberIds: ["bob"] },
      ],
    });
  });

  it("supports direct-person expense ledgers", () => {
    const directGroup: Group = {
      ...group,
      id: "direct-alice-bob",
      name: "Alice & Bob",
      kind: "direct",
      directStatus: "draft",
      participantUids: ["alice"],
      members: group.members.slice(0, 2),
      expenses: [
        {
          id: "direct-expense",
          description: "Coffee",
          amount: 240,
          paidBy: "alice",
          createdBy: "alice",
          splitType: "equal",
          category: "drinks",
          date: "2026-07-12",
          dueDate: "2026-07-19",
          splits: [
            { memberId: "alice", amount: 120 },
            { memberId: "bob", amount: 120 },
          ],
        },
      ],
    };

    const result = parseExpensesCsv(
      exportExpensesCsv(directGroup),
      { ...directGroup, expenses: [] },
      "alice",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expenses[0]).toMatchObject({
      description: "Coffee",
      amount: 240,
      paidBy: "alice",
      createdBy: "alice",
      dueDate: "2026-07-19",
      splits: [
        { memberId: "alice", amount: 120 },
        { memberId: "bob", amount: 120 },
      ],
    });
  });

  it("rejects inconsistent item assignments and conversion values", () => {
    const result = parseExpensesCsv(
      [
        "date,description,category,amount,currency,originalAmount,originalCurrency,conversionRate,paidBy,splitType,splits,items,dueDate",
        '2026-07-10,Dinner,food,600,PHP,1000,JPY,0.5,Alice,itemized,"Alice:300;Bob:300","[{""name"":""Meal"",""amount"":600,""members"":[""Alice""]}]",2026-07-09',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toContain("Row 2: dueDate cannot be earlier than date");
    expect(result.errors).toContain(
      "Row 2: originalAmount × conversionRate must match amount",
    );
    expect(result.errors).toContain("Row 2: item assignments must match splits");
  });

  it("generates a group-specific CSV template", () => {
    const template = exportExpensesTemplateCsv(group);

    expect(template).toContain("PHP");
    expect(template).toContain("Alice:300;Bob:300;Carol:300");
    expect(template).toContain("Sample dinner");
  });

  it("rejects rows with unknown members and split mismatches", () => {
    const result = parseExpensesCsv(
      [
        "date,description,category,amount,currency,paidBy,splitType,splits",
        '2026-07-10,Dinner,food,900,PHP,Mark,equal,"Alice:300;Bob:300"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toEqual([
      'Row 2: paidBy "Mark" is not a group member',
      "Row 2: split total 600.00 does not match amount 900.00",
    ]);
  });

  it("rejects invalid amounts and categories", () => {
    const result = parseExpensesCsv(
      [
        "date,description,category,amount,currency,paidBy,splitType,splits",
        '2026-07-10,Dinner,invalid,abc,PHP,Alice,equal,"Alice:0"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;

    expect(result.errors).toContain("Row 2: amount must be greater than zero");
    expect(
      result.errors.some((error) =>
        error.startsWith("Row 2: category must be one of food, drinks, groceries"),
      ),
    ).toBe(true);
  });

  it("accepts You as an alias for the importing member", () => {
    const result = parseExpensesCsv(
      [
        "date,description,category,amount,currency,paidBy,splitType,splits",
        '2026-07-10,Dinner,food,600,PHP,You,equal,"You:300;Bob:300"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.expenses[0].paidBy).toBe("alice");
    expect(result.expenses[0].splits[0]).toEqual({
      memberId: "alice",
      amount: 300,
    });
  });

  it("imports activities expenses", () => {
    const result = parseExpensesCsv(
      [
        "date,description,category,amount,currency,paidBy,splitType,splits",
        '2026-07-10,Island hopping,activities,600,PHP,Alice,equal,"Alice:300;Bob:300"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.expenses[0].category).toBe("activities");
  });

  it("requires and preserves a custom label for Other", () => {
    const missingDetail = parseExpensesCsv(
      [
        "date,description,category,categoryDetail,amount,currency,paidBy,splitType,splits",
        '2026-07-10,Tips,other,,600,PHP,Alice,equal,"Alice:300;Bob:300"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(missingDetail).toEqual({
      ok: false,
      errors: ["Row 2: categoryDetail is required when category is other"],
    });

    const result = parseExpensesCsv(
      [
        "date,description,category,categoryDetail,amount,currency,paidBy,splitType,splits",
        '2026-07-10,Tips,other,Tour guide tip,600,PHP,Alice,equal,"Alice:300;Bob:300"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.expenses[0].categoryDetail).toBe("Tour guide tip");
  });

  it("rejects a CSV with no expense rows", () => {
    const result = parseExpensesCsv(
      "date,description,category,amount,currency,paidBy,splitType,splits\n",
      group,
      "alice",
    );

    expect(result).toEqual({
      ok: false,
      errors: ["CSV must include at least one expense row"],
    });
  });

  it("rejects an expense that already exists in the group", () => {
    const result = parseExpensesCsv(exportExpensesCsv(group), group, "alice");

    expect(result).toEqual({
      ok: false,
      errors: ["Row 2: duplicate expense already exists in this group"],
    });
  });

  it("rejects duplicate expenses inside the same CSV file", () => {
    const result = parseExpensesCsv(
      [
        "date,description,category,amount,currency,paidBy,splitType,splits",
        '2026-07-11,Lunch,food,600,PHP,Alice,equal,"Alice:300;Bob:300"',
        '2026-07-11,Lunch,food,600,PHP,Alice,equal,"Bob:300;Alice:300"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result).toEqual({
      ok: false,
      errors: ["Row 3: duplicate expense in this CSV file"],
    });
  });
});
