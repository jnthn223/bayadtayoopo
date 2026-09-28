import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAYMENT_REMINDER_PREFERENCES,
  normalizePaymentReminderPreferences,
} from "./reminderPreferences";

describe("payment reminder preferences", () => {
  it("enables a weekly Friday email summary by default", () => {
    expect(normalizePaymentReminderPreferences()).toEqual(
      DEFAULT_PAYMENT_REMINDER_PREFERENCES,
    );
    expect(DEFAULT_PAYMENT_REMINDER_PREFERENCES).toMatchObject({
      emailEnabled: true,
      inAppEnabled: true,
      frequency: "weekly",
      weekday: 5,
      hour: 9,
      timeZone: "Asia/Manila",
    });
  });

  it("repairs invalid schedule values while preserving group controls", () => {
    expect(
      normalizePaymentReminderPreferences({
        frequency: "weekly",
        weekday: 20,
        hour: -1,
        mutedGroupIds: ["trip"],
        groupSnoozes: { office: "2026-10-10T00:00:00.000Z" },
      }),
    ).toMatchObject({
      weekday: 5,
      hour: 9,
      mutedGroupIds: ["trip"],
      groupSnoozes: { office: "2026-10-10T00:00:00.000Z" },
    });
  });
});
