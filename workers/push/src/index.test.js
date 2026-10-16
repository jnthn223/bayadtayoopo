import { describe, expect, it } from "vitest";
import { validateAndBuild } from "./index.js";

const group = {
  id: "trip",
  name: "Trip",
  currency: "PHP",
  members: [
    { id: "alice-member", uid: "alice", name: "Alice" },
    { id: "bob-member", uid: "bob", name: "Bob" },
    { id: "cara-member", uid: "cara", name: "Cara" },
  ],
  expenses: [],
  payments: [],
  messages: [
    {
      id: "message",
      memberId: "alice-member",
      text: "Receipt uploaded",
      createdAt: "2026-07-28T01:00:00.000Z",
    },
  ],
};

describe("push worker event authorization", () => {
  it("builds recipients from the saved group instead of client input", () => {
    const notification = validateAndBuild(
      group,
      {
        type: "chat_message",
        entityId: "message",
        occurredAt: "2026-07-28T01:00:00.000Z",
      },
      "alice",
    );

    expect(notification.recipients.map((member) => member.uid)).toEqual([
      "bob",
      "cara",
    ]);
    expect(notification.url).toContain("message=message");
  });

  it("rejects a user spoofing another member's message", () => {
    expect(() =>
      validateAndBuild(
        group,
        {
          type: "chat_message",
          entityId: "message",
          occurredAt: "2026-07-28T01:00:00.000Z",
        },
        "bob",
      ),
    ).toThrow("does not match");
  });

  it("targets only mentioned members for a mentioned chat message", () => {
    const mentionedGroup = {
      ...group,
      messages: [
        {
          ...group.messages[0],
          text: "@Bob please check this",
          mentionedMemberIds: ["bob-member"],
        },
      ],
    };
    const notification = validateAndBuild(
      mentionedGroup,
      {
        type: "chat_message",
        entityId: "message",
        occurredAt: "2026-07-28T01:00:00.000Z",
      },
      "alice",
    );
    expect(notification.recipients.map((member) => member.uid)).toEqual(["bob"]);
    expect(notification.title).toContain("mentioned you");
  });

  it("sends a balance offset request only to its counterparty", () => {
    const withOffset = {
      ...group,
      balanceOffsets: [
        {
          id: "offset",
          requesterMemberId: "alice-member",
          counterpartyMemberId: "bob-member",
          amount: 500,
          status: "pending",
          requestedAt: "2026-07-28T01:00:00.000Z",
          requestedBy: "alice-member",
        },
      ],
    };
    const notification = validateAndBuild(
      withOffset,
      {
        type: "balance_offset_requested",
        entityId: "offset",
        occurredAt: "2026-07-28T01:00:00.000Z",
      },
      "alice",
    );
    expect(notification.recipients.map((member) => member.uid)).toEqual(["bob"]);
    expect(notification.title).toContain("approval");
  });

  it("sends a direct expense request only to the other person", () => {
    const direct = {
      ...group,
      kind: "direct",
      members: group.members.slice(0, 2),
      directStatus: "pending",
      directRequestedBy: "alice",
      directRequestedAt: "2026-07-28T01:00:00.000Z",
      expenses: [{
        id: "dinner",
        description: "Dinner",
        amount: 500,
        createdBy: "alice-member",
        paidBy: "alice-member",
        splits: [],
      }],
    };
    const notification = validateAndBuild(
      direct,
      {
        type: "direct_request",
        entityId: direct.id,
        occurredAt: direct.directRequestedAt,
      },
      "alice",
    );
    expect(notification.recipients.map((member) => member.uid)).toEqual(["bob"]);
    expect(notification.title).toBe("Direct expense request");
    expect(notification.url).toContain("expense=dinner");
  });

  it("includes a direct correction rejection reason", () => {
    const direct = {
      ...group,
      kind: "direct",
      members: group.members.slice(0, 2),
      expenseCorrectionRequests: [{
        id: "fix",
        expenseId: "expense",
        reason: "Wrong amount",
        requestedBy: "alice-member",
        status: "rejected",
        reviewedBy: "bob-member",
        reviewedAt: "2026-07-28T02:00:00.000Z",
        rejectionReason: "The receipt shows the original amount",
      }],
    };
    const notification = validateAndBuild(
      direct,
      {
        type: "direct_correction_rejected",
        entityId: "fix",
        occurredAt: "2026-07-28T02:00:00.000Z",
      },
      "bob",
    );
    expect(notification.recipients.map((member) => member.uid)).toEqual(["alice"]);
    expect(notification.body).toBe("The receipt shows the original amount");
  });
});
