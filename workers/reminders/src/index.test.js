import { describe, expect, it } from "vitest";
import { buildPublicStats, buildUserSummary, deadlineReminderKey, hasReminderEmail, reminderIsDue, userDisplayName } from "./index.js";

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
  it("never uses a Firestore document path as the email greeting", () => {
    expect(userDisplayName({
      name: "projects/example/databases/(default)/documents/users/123",
      email: "jonathan@example.com",
    })).toBe("jonathan");
  });
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

  it("includes unpaid deadline amounts in the reminder summary", () => {
    const result = buildUserSummary(user, [{
      ...group,
      expenses: [{ ...group.expenses[0], dueDate: "2026-10-02", createdAt: "2026-10-01T00:00:00.000Z" }],
    }], new Date("2026-10-02T01:00:00.000Z"));

    expect(result[0]).toMatchObject({
      nearestDueDate: "2026-10-02",
      dueTodayAmount: 500,
    });
    expect(deadlineReminderKey(result)).toBe("trip:today:2026-10-02");
  });

  it("identifies deadline milestones independently of the recurring reminder hour", () => {
    const summaries = buildUserSummary(user, [{
      ...group,
      expenses: [{ ...group.expenses[0], dueDate: "2026-10-02" }],
    }], new Date("2026-10-02T07:00:00.000Z"));

    expect(reminderIsDue(user, new Date("2026-10-02T07:00:00.000Z"))).toBe(false);
    expect(deadlineReminderKey(summaries)).toBe("trip:today:2026-10-02");
  });

  it("includes an accepted payment schedule only on its recurring date", () => {
    const scheduledGroup = {
      ...group,
      paymentSchedules: [{
        id: "schedule-1",
        payeeMemberId: "payer",
        debtorMemberId: "debtor",
        coverage: [{ expenseId: "food", expenseDescription: "Food", amount: 500 }],
        installmentAmount: 125,
        frequency: "monthly",
        firstPaymentDate: "2026-10-02",
        status: "active",
      }],
    };
    const due = buildUserSummary(user, [scheduledGroup], new Date("2026-10-02T01:00:00.000Z"));
    expect(due[0]).toMatchObject({
      scheduledPaymentAmount: 125,
      scheduledPaymentCount: 1,
      scheduledExpenseNames: ["Food"],
    });
    expect(deadlineReminderKey(due)).toContain("schedule:trip:2026-10-02:schedule-1");

    const notDue = buildUserSummary(user, [scheduledGroup], new Date("2026-10-03T01:00:00.000Z"));
    expect(notDue[0].scheduledPaymentAmount).toBeUndefined();
  });
});
