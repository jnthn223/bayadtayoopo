import { describe, expect, it } from "vitest";
import type { Group, Member } from "./types";
import { buildMemberCatchUpSummary } from "./memberCatchUpSummary";

const claimedMember: Member = {
  id: "reva",
  uid: "reva-uid",
  name: "Reva",
  color: "#654cf5",
  claimedFromPlaceholder: true,
  joinedAt: "2026-10-07T10:00:00.000Z",
};

const group: Group = {
  id: "trip",
  name: "Cebu Trip",
  adminId: "jonathan",
  currency: "PHP",
  createdAt: "2026-10-01T00:00:00.000Z",
  members: [
    { id: "jonathan", uid: "jonathan-uid", name: "Jonathan", color: "#111" },
    claimedMember,
  ],
  expenses: [
    {
      id: "hotel",
      description: "Hotel",
      amount: 1000,
      paidBy: "jonathan",
      createdBy: "jonathan",
      createdAt: "2026-10-03T10:00:00.000Z",
      date: "2026-10-03",
      category: "trip",
      splitType: "custom",
      splits: [
        { memberId: "jonathan", amount: 500 },
        { memberId: "reva", amount: 500 },
      ],
    },
  ],
  payments: [
    {
      id: "payment",
      fromMemberId: "jonathan",
      toMemberId: "reva",
      amount: 100,
      method: "Cash",
      allocations: [],
      status: "confirmed",
      submittedAt: "2026-10-05T08:00:00.000Z",
      submittedBy: "jonathan",
      reviewedAt: "2026-10-05T09:00:00.000Z",
      reviewedBy: "jonathan",
      reviewedOnBehalfOfMemberId: "reva",
    },
  ],
  messages: [
    {
      id: "before",
      memberId: "jonathan",
      text: "See you there",
      createdAt: "2026-10-06T09:00:00.000Z",
    },
    {
      id: "after",
      memberId: "jonathan",
      text: "Welcome!",
      createdAt: "2026-10-07T11:00:00.000Z",
    },
  ],
};

describe("member claim catch-up", () => {
  it("summarizes records created before the member joined", () => {
    expect(buildMemberCatchUpSummary(group, claimedMember)).toMatchObject({
      assignedExpenseCount: 1,
      pendingReviewCount: 0,
      adminConfirmedPaymentCount: 1,
      earlierMessageCount: 1,
    });
  });
});
