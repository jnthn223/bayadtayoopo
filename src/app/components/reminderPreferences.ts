import type { PaymentReminderPreferences } from "./types";

export const DEFAULT_PAYMENT_REMINDER_PREFERENCES: PaymentReminderPreferences = {
  emailEnabled: true,
  inAppEnabled: true,
  frequency: "weekly",
  weekday: 5,
  hour: 9,
  timeZone: "Asia/Manila",
  mutedGroupIds: [],
  groupSnoozes: {},
};

export function normalizePaymentReminderPreferences(
  value?: Partial<PaymentReminderPreferences>,
): PaymentReminderPreferences {
  const frequency = ["every3days", "weekly", "biweekly", "monthly"].includes(
    value?.frequency ?? "",
  )
    ? value!.frequency!
    : DEFAULT_PAYMENT_REMINDER_PREFERENCES.frequency;
  return {
    ...DEFAULT_PAYMENT_REMINDER_PREFERENCES,
    ...value,
    frequency,
    weekday:
      Number.isInteger(value?.weekday) && value!.weekday! >= 0 && value!.weekday! <= 6
        ? value!.weekday!
        : DEFAULT_PAYMENT_REMINDER_PREFERENCES.weekday,
    hour:
      Number.isInteger(value?.hour) && value!.hour! >= 0 && value!.hour! <= 23
        ? value!.hour!
        : DEFAULT_PAYMENT_REMINDER_PREFERENCES.hour,
    mutedGroupIds: Array.isArray(value?.mutedGroupIds)
      ? value!.mutedGroupIds.filter((id): id is string => typeof id === "string")
      : [],
    groupSnoozes:
      value?.groupSnoozes && typeof value.groupSnoozes === "object"
        ? value.groupSnoozes
        : {},
  };
}
