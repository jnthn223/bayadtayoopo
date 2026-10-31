import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GroupPayments } from "./GroupPayments";
import type { Group } from "./types";
import { computeProjectedBalances, computeSettlements } from "./utils";

describe("GroupPayments legacy history", () => {
  it("renders when a reversed payment references a deleted expense", () => {
    const group: Group = {
      id: "legacy-group",
      name: "Legacy group",
      adminId: "alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      currency: "PHP",
      members: [
        { id: "alice", uid: "alice", name: "Alice", color: "#111111" },
        { id: "bob", uid: "bob", name: "Bob", color: "#222222" },
      ],
      expenses: [],
      payments: [{
        id: "legacy-payment",
        fromMemberId: "bob",
        toMemberId: "alice",
        amount: 58,
        method: "Cash / other",
        allocations: [{
          expenseId: "deleted-expense",
          expenseDescription: "Deleted expense",
          amount: 58,
        }],
        status: "reversed",
        submittedAt: "2026-01-02T00:00:00.000Z",
        submittedBy: "alice",
        reversedAt: "2026-01-03T00:00:00.000Z",
        reversedBy: "alice",
      }],
    };
    const currentMember = group.members[0];

    expect(() => renderToString(
      <GroupPayments
        group={group}
        currentMember={currentMember}
        isAdmin
        settlements={computeSettlements(computeProjectedBalances(group))}
        settlementMode="direct"
        settlementModeRemembered={false}
        onSettlementModePreferenceChange={() => {}}
        onUpdate={() => {}}
        viewPaymentImage={() => {}}
      />,
    )).not.toThrow();
  });
});
