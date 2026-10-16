import { describe, expect, it } from "vitest";
import type { CurrentUser, Group } from "./types";
import { createDirectLedger, directLedgerId, getDirectContacts } from "./directExpenses";
import { computeBalances, getTotalExpenses } from "./utils";

const user: CurrentUser = { id: "alice", name: "Alice", email: "a@example.com", color: "#111" };
const shared: Group = {
  id: "trip", name: "Trip", currency: "PHP", createdAt: "now", expenses: [],
  members: [
    { id: "alice-member", uid: "alice", name: "Alice", color: "#111" },
    { id: "bob-member", uid: "bob", name: "Bob", color: "#222" },
    { id: "pending", name: "Pending Bob", color: "#333" },
  ],
};

describe("direct expenses", () => {
  it("uses the same ledger id regardless of creator", () => {
    expect(directLedgerId("alice", "bob")).toBe(directLedgerId("bob", "alice"));
  });

  it("suggests only claimed members", () => {
    expect(getDirectContacts([shared], "alice").map((item) => item.uid)).toEqual(["bob"]);
  });

  it("creates a private two-person ledger", () => {
    const ledger = createDirectLedger(user, shared.members[1], "PHP", "now");
    expect(ledger.kind).toBe("direct");
    expect(ledger.participantUids).toEqual(["alice"]);
    expect(ledger.members[1].uid).toBeUndefined();
    expect(ledger.directContactUid).toBe("bob");
    expect(ledger.directStatus).toBe("draft");
  });

  it("creates a provisional claim-ready ledger for a person without an account", () => {
    const ledger = createDirectLedger(
      user,
      { id: "temporary-reva", name: "Reva", color: "#333" },
      "PHP",
      "now",
    );
    expect(ledger.participantUids).toEqual(["alice"]);
    expect(ledger.members[1].uid).toBeUndefined();
    expect(ledger.members[1].claimCode).toBeTruthy();
    expect(ledger.directStatus).toBe("draft");
  });

  it("keeps a draft out of public totals but computes its provisional balance", () => {
    const ledger = createDirectLedger(user, shared.members[1], "PHP", "now");
    const bobId = ledger.members[1].id;
    ledger.expenses = [{
      id: "dinner", description: "Dinner", amount: 500, paidBy: "alice",
      createdBy: "alice", splitType: "equal", date: "2026-01-01", category: "food",
      splits: [
        { memberId: "alice", amount: 250 },
        { memberId: bobId, amount: 250 },
      ],
    }];
    expect(getTotalExpenses(ledger)).toBe(0);
    expect(computeBalances(ledger).find((balance) => balance.memberId === bobId)?.net).toBe(-250);

    ledger.directStatus = "active";
    expect(getTotalExpenses(ledger)).toBe(500);
    expect(computeBalances(ledger).find((balance) => balance.memberId === bobId)?.net).toBe(-250);
  });
});
