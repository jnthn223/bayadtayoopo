import { describe, expect, it } from "vitest";
import type { Group } from "./types";
import { buildOverallBalances } from "./overallBalances";

function group(
  id: string,
  currency: string,
  amount: number,
  payer: "me" | "friend",
): Group {
  return {
    id,
    name: id,
    currency,
    createdAt: "2026-01-01T00:00:00.000Z",
    members: [
      { id: "me-member", uid: "me", name: "Me", color: "#000" },
      { id: `friend-${id}`, uid: "friend", name: "Reva", color: "#fff" },
    ],
    expenses: [{
      id: `expense-${id}`,
      description: "Expense",
      amount,
      paidBy: payer === "me" ? "me-member" : `friend-${id}`,
      splitType: "custom",
      splits: [
        { memberId: "me-member", amount: amount / 2 },
        { memberId: `friend-${id}`, amount: amount / 2 },
      ],
      date: "2026-01-01",
      category: "other",
    }],
  };
}

describe("buildOverallBalances", () => {
  it("nets the same claimed person across groups", () => {
    const result = buildOverallBalances([
      group("Trip", "PHP", 2000, "friend"),
      group("Lunch", "PHP", 600, "me"),
    ], { id: "me" });

    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(-700);
    expect(result[0].sources.map((source) => source.amount)).toEqual([-1000, 300]);
  });

  it("does not combine currencies", () => {
    const result = buildOverallBalances([
      group("Trip", "PHP", 2000, "friend"),
      group("Travel", "USD", 20, "me"),
    ], { id: "me" });

    expect(result).toHaveLength(2);
    expect(new Set(result.map((item) => item.currency))).toEqual(new Set(["PHP", "USD"]));
  });

  it("does not infer identity from an unclaimed member name", () => {
    const pending = group("Trip", "PHP", 2000, "friend");
    delete pending.members[1].uid;
    expect(buildOverallBalances([pending], { id: "me" })).toEqual([]);
  });
});
