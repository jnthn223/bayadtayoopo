import { describe, expect, it } from "vitest";
import type { Group } from "./types";
import {
  deriveNotifications,
  isNotificationUnread,
  notificationUrl,
  normalizeNotificationPreferences,
} from "./notifications";

const group: Group = {
  id: "trip",
  name: "Beach Trip",
  adminId: "alice",
  members: [
    { id: "alice", uid: "alice-uid", name: "Alice", color: "#111" },
    { id: "bob", uid: "bob-uid", name: "Bob", color: "#222" },
  ],
  expenses: [
    {
      id: "dinner",
      description: "Dinner",
      amount: 100,
      paidBy: "alice",
      createdBy: "alice",
      createdAt: "2026-07-01T10:00:00.000Z",
      splitType: "equal",
      splits: [
        { memberId: "alice", amount: 50 },
        { memberId: "bob", amount: 50 },
      ],
      date: "2026-07-01",
      category: "food",
    },
  ],
  payments: [
    {
      id: "payment-1",
      fromMemberId: "bob",
      toMemberId: "alice",
      amount: 25,
      method: "GCash",
      allocations: [
        {
          expenseId: "dinner",
          expenseDescription: "Dinner",
          amount: 25,
        },
      ],
      status: "pending",
      submittedAt: "2026-07-02T10:00:00.000Z",
      submittedBy: "bob",
    },
  ],
  messages: [
    {
      id: "message-1",
      memberId: "alice",
      text: "Please check the receipt",
      createdAt: "2026-07-03T10:00:00.000Z",
    },
  ],
  createdAt: "2026-07-01T00:00:00.000Z",
  currency: "PHP",
};

describe("Spark notification derivation", () => {
  it("derives only events relevant to the current member", () => {
    const forAlice = deriveNotifications([group], "alice-uid");
    expect(forAlice.map((item) => item.type)).toEqual(["payment_submitted"]);

    const forBob = deriveNotifications([group], "bob-uid");
    expect(forBob.map((item) => item.type)).toEqual([
      "chat_message",
      "expense_created",
    ]);
  });

  it("respects category and per-group chat preferences", () => {
    expect(
      deriveNotifications([group], "bob-uid", {
        expenses: false,
        mutedChatGroupIds: ["trip"],
      }),
    ).toEqual([]);
  });

  it("uses a read cursor and produces deep links", () => {
    const notification = deriveNotifications([group], "alice-uid")[0];
    expect(
      isNotificationUnread(notification, "2026-07-02T09:00:00.000Z"),
    ).toBe(true);
    expect(
      isNotificationUnread(notification, "2026-07-02T11:00:00.000Z"),
    ).toBe(false);
    expect(notificationUrl(notification)).toBe(
      "/?openGroup=trip&tab=settle&payment=payment-1",
    );
  });

  it("fills missing preferences with safe defaults", () => {
    expect(normalizeNotificationPreferences({ chat: false })).toMatchObject({
      payments: true,
      expenses: true,
      chat: false,
      memberActivity: false,
      systemNotifications: false,
      mutedChatGroupIds: [],
    });
  });

  it("keeps the submitted event after its payment is confirmed", () => {
    const confirmedGroup: Group = {
      ...group,
      payments: [
        {
          ...group.payments![0],
          status: "confirmed",
          reviewedAt: "2026-07-04T10:00:00.000Z",
          reviewedBy: "alice",
        },
      ],
    };

    expect(
      deriveNotifications([confirmedGroup], "alice-uid").map(
        (item) => item.type,
      ),
    ).toContain("payment_submitted");
    expect(
      deriveNotifications([confirmedGroup], "bob-uid").map(
        (item) => item.type,
      ),
    ).toContain("payment_confirmed");
  });

  it("notifies both sides of a balance offset approval flow", () => {
    const withOffset: Group = {
      ...group,
      balanceOffsets: [
        {
          id: "offset-1",
          requesterMemberId: "bob",
          counterpartyMemberId: "alice",
          amount: 25,
          debitAllocations: [],
          creditAllocations: [],
          status: "confirmed",
          requestedAt: "2026-07-05T10:00:00.000Z",
          requestedBy: "bob",
          reviewedAt: "2026-07-05T11:00:00.000Z",
          reviewedBy: "alice",
        },
      ],
    };
    expect(
      deriveNotifications([withOffset], "alice-uid").map((item) => item.type),
    ).toContain("balance_offset_requested");
    expect(
      deriveNotifications([withOffset], "bob-uid").map((item) => item.type),
    ).toContain("balance_offset_confirmed");
  });
});
