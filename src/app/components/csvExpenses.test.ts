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
      },
    ]);
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
    expect(result.errors).toContain(
      "Row 2: category must be one of food, transport, accommodation, trip, entertainment, shopping, utilities, other",
    );
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

  it("imports trip expenses", () => {
    const result = parseExpensesCsv(
      [
        "date,description,category,amount,currency,paidBy,splitType,splits",
        '2026-07-10,Island hopping,trip,600,PHP,Alice,equal,"Alice:300;Bob:300"',
      ].join("\n"),
      group,
      "alice",
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.expenses[0].category).toBe("trip");
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
