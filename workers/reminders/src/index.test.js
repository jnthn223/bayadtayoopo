import { describe, expect, it } from "vitest";
import { buildPublicStats, buildUserSummary, hasReminderEmail, reminderIsDue } from "./index.js";

const user = {
  id: "debtor-uid",
  email: "debtor@example.com",
  paymentReminderPreferences: {
    emailEnabled: true,
    inAppEnabled: true,
    frequency: "weekly",
    weekday: 5,
    hour: 9,
    timeZone: "Asia/Manila",
    mutedGroupIds: [],
    groupSnoozes: {},
  },
};

const group = {
  id: "trip",
  name: "Cebu Trip",
  currency: "PHP",
  members: [
    { id: "payer", uid: "payer-uid", name: "Payer" },
    { id: "debtor", uid: "debtor-uid", name: "Debtor" },
  ],
  expenses: [{
    id: "food",
    amount: 1000,
    paidBy: "payer",
    date: "2026-09-01",
    createdAt: "2026-09-01T00:00:00.000Z",
    splits: [
      { memberId: "payer", amount: 500 },
      { memberId: "debtor", amount: 500 },
    ],
  }],
  payments: [],
};

describe("payment reminder worker", () => {
  it("builds privacy-safe public totals", () => {
    expect(
      buildPublicStats([user, { id: "another" }], [group, { ...group, id: "second", expenses: [] }], new Date("2026-10-07T07:00:00.000Z")),
    ).toEqual({
      userCount: 2,
      groupCount: 2,
      expenseCount: 1,
      updatedAt: "2026-10-07T07:00:00.000Z",
    });
  });

  it("runs at the configured local weekly time", () => {
    expect(reminderIsDue(user, new Date("2026-10-02T01:00:00.000Z"))).toBe(true);
    expect(reminderIsDue(user, new Date("2026-10-02T02:00:00.000Z"))).toBe(false);
  });

  it("builds one summary item and excludes a pending payment", () => {
    const result = buildUserSummary(user, [{
      ...group,
      payments: [{
        id: "payment",
        fromMemberId: "debtor",
        toMemberId: "payer",
        amount: 200,
        status: "pending",
      }],
    }], new Date("2026-10-02T01:00:00.000Z"));
    expect(result).toEqual([{
      groupId: "trip",
      groupName: "Cebu Trip",
      amount: 300,
      currency: "PHP",
      pendingPaymentAmount: 200,
    }]);
  });

  it("honors per-group mute", () => {
    const muted = {
      ...user,
      paymentReminderPreferences: {
        ...user.paymentReminderPreferences,
        mutedGroupIds: ["trip"],
      },
    };
    expect(buildUserSummary(muted, [group], new Date("2026-10-02T01:00:00.000Z"))).toEqual([]);
  });

  it("allows in-app reminders without requiring an email address", () => {
    const userWithoutEmail = { ...user, email: undefined };

    expect(reminderIsDue(userWithoutEmail, new Date("2026-10-02T01:00:00.000Z"))).toBe(true);
    expect(buildUserSummary(userWithoutEmail, [group], new Date("2026-10-02T01:00:00.000Z"))).toHaveLength(1);
    expect(hasReminderEmail(userWithoutEmail)).toBe(false);
  });
});
