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
        onSettlementModePreferenceChange={() => {}}
        onUpdate={() => {}}
        viewPaymentImage={() => {}}
      />,
    )).not.toThrow();
  });

  it("shows the payment-route preference before the member has a balance", () => {
    const group: Group = {
      id: "future-group",
      name: "Future trip",
      adminId: "alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      currency: "PHP",
      members: [
        { id: "alice", uid: "alice", name: "Alice", color: "#111111" },
        { id: "bob", uid: "bob", name: "Bob", color: "#222222" },
      ],
      expenses: [],
    };

    const html = renderToString(
      <GroupPayments
        group={group}
        currentMember={group.members[0]}
        isAdmin
        settlements={[]}
        settlementMode="direct"
        onSettlementModePreferenceChange={() => {}}
        onUpdate={() => {}}
        viewPaymentImage={() => {}}
      />,
    );

    expect(html).toContain("How do you want to settle?");
    expect(html).toContain("Original payees");
    expect(html).toContain("Fewer transfers");
    expect(html).toContain("no balance activity yet");
  });

  it("keeps specific-expense details hidden until that scope is selected", () => {
    const group: Group = {
      id: "busy-group",
      name: "Busy group",
      adminId: "alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      currency: "PHP",
      members: [
        { id: "alice", uid: "alice", name: "Alice", color: "#111111" },
        { id: "bob", uid: "bob", name: "Bob", color: "#222222" },
      ],
      expenses: [{
        id: "dinner",
        description: "Hidden dinner detail",
        amount: 100,
        paidBy: "alice",
        splitType: "equal",
        splits: [
          { memberId: "alice", amount: 50 },
          { memberId: "bob", amount: 50 },
        ],
        date: "2026-01-02",
        category: "food",
      }],
    };

    const settlements = computeSettlements(computeProjectedBalances(group));
    const html = renderToString(
      <GroupPayments
        group={group}
        currentMember={group.members[1]}
        isAdmin={false}
        settlements={settlements}
        settlementMode="direct"
        onSettlementModePreferenceChange={() => {}}
        onUpdate={() => {}}
        viewPaymentImage={() => {}}
      />,
    );

    expect(html).toContain("Specific expense");
    expect(html).not.toContain("Hidden dinner detail");
  });

  it("presents temporary-member management as a mode beside the settlement methods", () => {
    const group: Group = {
      id: "temporary-group",
      name: "Temporary members",
      adminId: "alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      currency: "PHP",
      members: [
        { id: "alice", uid: "alice", name: "Alice", color: "#111111" },
        { id: "temp-one", name: "Person 1", color: "#222222" },
        { id: "temp-two", name: "Person 2", color: "#333333" },
      ],
      expenses: [],
    };

    const html = renderToString(
      <GroupPayments
        group={group}
        currentMember={group.members[0]}
        isAdmin
        settlements={[]}
        settlementMode="direct"
        onSettlementModePreferenceChange={() => {}}
        onUpdate={() => {}}
        viewPaymentImage={() => {}}
      />,
    );

    expect(html).toContain("Manage temporary members");
    expect(html).toContain("Apply the selected method");
    expect(html).toContain("Original payees");
    expect(html).toContain("Specific expense");
  });
});
