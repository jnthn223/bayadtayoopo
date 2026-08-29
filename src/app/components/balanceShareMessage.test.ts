import { describe, expect, it } from "vitest";
import { buildBalanceShareMessage } from "./balanceShareMessage";
import type { Group, Member } from "./types";

const member: Member = {
  id: "bea",
  name: "Bea",
  color: "#7c3aed",
};

const group = {
  id: "trip",
  name: "Dumaguete 2026",
  currency: "PHP",
  members: [member],
  expenses: [],
} as Group;

describe("balance share message", () => {
  it("explains an amount the member needs to settle", () => {
    const message = buildBalanceShareMessage({
      group,
      member,
      balance: -1250,
      senderName: "Jonathan",
      groupUrl: "https://bayadtayoopo.web.app/?openGroup=trip",
    });

    expect(message).toContain("Hi Bea!");
    expect(message).toContain("Current amount to settle: ₱1,250.00");
    expect(message).toContain("see what this balance covers");
    expect(message).toContain("Shared by Jonathan.");
    expect(message).toContain("openGroup=trip");
  });

  it("adapts when the member has money to receive", () => {
    const message = buildBalanceShareMessage({
      group,
      member,
      balance: 500,
      groupUrl: "https://bayadtayoopo.web.app/?openGroup=trip",
    });

    expect(message).toContain("Current amount to receive: ₱500.00");
    expect(message).not.toContain("Shared by");
  });
});
