interface SystemAlertsPromptConditions {
  authenticated: boolean;
  profileLoaded: boolean;
  onHomeScreen: boolean;
  available: boolean;
  permission: NotificationPermission;
  systemNotificationsEnabled: boolean;
  dismissed: boolean;
}

export function shouldShowSystemAlertsPrompt({
  authenticated,
  profileLoaded,
  onHomeScreen,
  available,
  permission,
  systemNotificationsEnabled,
  dismissed,
}: SystemAlertsPromptConditions): boolean {
  return (
    authenticated &&
    profileLoaded &&
    onHomeScreen &&
    available &&
    permission !== "denied" &&
    !(permission === "granted" && systemNotificationsEnabled) &&
    !dismissed
  );
}
