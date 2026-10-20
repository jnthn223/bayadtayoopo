import { describe, expect, it } from "vitest";
import {
  allocateItemizedShares,
  getItemizedMemberAmount,
  itemizedTotal,
} from "./itemizedExpense";

describe("itemized expense allocation", () => {
  it("splits shared items in cents and preserves the exact total", () => {
    const items = [
      { id: "burger", name: "Burger", amount: 180, memberIds: ["alex"] },
      { id: "fries", name: "Fries", amount: 100.01, memberIds: ["alex", "mika"] },
    ];
    const result = allocateItemizedShares(items);
    expect(result).toEqual({ alex: 230.01, mika: 50 });
    expect(Object.values(result).reduce((sum, value) => sum + value, 0)).toBe(280.01);
    expect(itemizedTotal(items)).toBe(280.01);
  });

  it("returns the exact member allocation for a shared item", () => {
    const item = {
      id: "shared",
      name: "Shared snack",
      amount: 10,
      memberIds: ["alex", "mika", "sam"],
    };

    expect(getItemizedMemberAmount(item, "alex")).toBe(3.34);
    expect(getItemizedMemberAmount(item, "mika")).toBe(3.33);
    expect(getItemizedMemberAmount(item, "sam")).toBe(3.33);
    expect(getItemizedMemberAmount(item, "other")).toBe(0);
  });

  it("does not allocate an item until someone is assigned", () => {
    expect(allocateItemizedShares([
      { id: "unassigned", name: "Unknown", amount: 50, memberIds: [] },
    ])).toEqual({});
  });
});
