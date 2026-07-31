import { describe, expect, it } from "vitest";
import { shouldShowSystemAlertsPrompt } from "./systemAlertsPromptRules";

const ready = {
  authenticated: true,
  profileLoaded: true,
  onHomeScreen: true,
  available: true,
  permission: "default" as const,
  systemNotificationsEnabled: false,
  dismissed: false,
};

describe("system alerts prompt", () => {
  it("offers alerts after a signed-in user's profile is ready", () => {
    expect(shouldShowSystemAlertsPrompt(ready)).toBe(true);
  });

  it("does not nag users who enabled, blocked, or dismissed alerts", () => {
    expect(
      shouldShowSystemAlertsPrompt({
        ...ready,
        permission: "granted",
        systemNotificationsEnabled: true,
      }),
    ).toBe(false);
    expect(
      shouldShowSystemAlertsPrompt({ ...ready, permission: "denied" }),
    ).toBe(false);
    expect(
      shouldShowSystemAlertsPrompt({ ...ready, dismissed: true }),
    ).toBe(false);
  });

  it("still asks on a new device when the account enabled alerts elsewhere", () => {
    expect(
      shouldShowSystemAlertsPrompt({
        ...ready,
        permission: "default",
        systemNotificationsEnabled: true,
      }),
    ).toBe(true);
  });

  it("waits for the profile and Home screen", () => {
    expect(
      shouldShowSystemAlertsPrompt({ ...ready, profileLoaded: false }),
    ).toBe(false);
    expect(
      shouldShowSystemAlertsPrompt({ ...ready, onHomeScreen: false }),
    ).toBe(false);
  });
});
