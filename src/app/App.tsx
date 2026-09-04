import { useState, useEffect, useMemo, useRef } from "react";
import type {
  AppNotification,
  Expense,
  Group,
  CurrentUser,
  NotificationDestination,
  Member,
} from "./components/types";
import {
  isMagicLink,
  completeMagicLink,
  setDisplayName,
  signInWithGoogle,
  AuthUser,
} from "../lib/firebaseRest";
import {
  saveSession,
  loadSession,
  clearSession,
  sessionToCurrentUser,
  getValidIdToken,
  type Session,
} from "../lib/auth";
import {
  saveGroup,
  loadUserGroups,
  joinGroup,
  deleteGroup,
  fetchGroup,
  pollGroup,
  subscribeGroup,
  loadOrCreateUserProfile,
  saveUserProfile,
} from "../lib/groupService";
import { MEMBER_COLORS } from "./components/utils";
import { compactGroupHistory, mergeGroupChanges } from "./components/groupMerge";
import { HomeScreen } from "./components/HomeScreen";
import { GroupScreen } from "./components/GroupScreen";
import { QuickAddScreen } from "./components/QuickAddScreen";
import {
  LoginScreen,
  CompleteProfileScreen,
  MagicLinkEmailScreen,
} from "./components/LoginScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { SystemAlertsPrompt } from "./components/SystemAlertsPrompt";
import { SimilarMemberPrompt } from "./components/SimilarMemberPrompt";
import { findSimilarPendingMember } from "./components/memberNameMatch";
import { shouldShowSystemAlertsPrompt } from "./components/systemAlertsPromptRules";
import { BrandMark, BrandWordmark } from "./components/Brand";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";
import {
  PWA_UPDATE_AVAILABLE_EVENT,
  restartWithPwaUpdate,
} from "../lib/pwaUpdate";
import {
  deriveNotifications,
  isNotificationUnread,
  normalizeNotificationPreferences,
  notificationUrl,
} from "./components/notifications";
import { collectPushEvents } from "./components/pushEvents";
import {
  disablePushNotifications,
  enablePushNotifications,
  getPushAvailability,
  sendPushEvents,
  syncPushNotifications,
  updatePushPreferences,
} from "../lib/pushNotifications";
import {
  isQuickAddPath,
  upsertExpense,
} from "./components/quickAddExpense";

/* MARKER-MAKE-KIT-INVOKED */

type AuthState =
  | "loading"
  | "unauthenticated"
  | "needs_link_email"
  | "needs_profile"
  | "authenticated";
type Screen = "home" | "group" | "profile";

const FALLBACK_POLL_MS = 3000;
const SPLASH_MIN_MS = 1200;
const SYSTEM_ALERTS_PROMPT_DELAY_MS = 1400;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function clearPendingJoin() {
  localStorage.removeItem("pendingJoinGroupId");
  localStorage.removeItem("pendingClaimMemberId");
  localStorage.removeItem("pendingClaimCode");
}

function systemAlertsPromptDismissedKey(userId: string) {
  return `bayadtayoopo:system-alerts-prompt-dismissed:${userId}`;
}

export default function App() {
  const [quickAddRoute, setQuickAddRoute] = useState(() =>
    isQuickAddPath(window.location.pathname),
  );
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [notificationDestination, setNotificationDestination] =
    useState<NotificationDestination | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [banner, setBanner] = useState<{
    text: string;
    type: "success" | "error";
    notification?: AppNotification;
  } | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [linkEmailError, setLinkEmailError] = useState("");
  const [splashMinimumElapsed, setSplashMinimumElapsed] = useState(false);
  const [waitingUpdate, setWaitingUpdate] = useState<ServiceWorker | null>(null);
  const [restartingForUpdate, setRestartingForUpdate] = useState(false);
  const [similarMemberJoin, setSimilarMemberJoin] = useState<{
    groupId: string;
    user: AuthUser;
    group: Group;
    member: Member;
  } | null>(null);
  const [systemAlertsPromptOpen, setSystemAlertsPromptOpen] = useState(false);
  const [systemAlertsPromptSaving, setSystemAlertsPromptSaving] =
    useState(false);
  const [systemAlertsPromptError, setSystemAlertsPromptError] = useState("");
  const syncRef = useRef<{
    unsubscribe?: () => void;
    poll?: ReturnType<typeof setInterval>;
  }>({});
  const handledDeepLinkRef = useRef("");
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const notificationStreamReadyRef = useRef(false);
  const bannerTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const handleLocationChange = () =>
      setQuickAddRoute(isQuickAddPath(window.location.pathname));
    window.addEventListener("popstate", handleLocationChange);
    return () => window.removeEventListener("popstate", handleLocationChange);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSplashMinimumElapsed(true),
      SPLASH_MIN_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const handleUpdate = (event: Event) => {
      setWaitingUpdate((event as CustomEvent<ServiceWorker>).detail);
    };
    window.addEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdate);
    return () =>
      window.removeEventListener(PWA_UPDATE_AVAILABLE_EVENT, handleUpdate);
  }, []);

  // ── Banner helper ───────────────────────────────────────────────────────
  function dismissBanner() {
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
      bannerTimerRef.current = null;
    }
    setBanner(null);
  }

  function showBanner(
    text: string,
    type: "success" | "error" = "success",
    notification?: AppNotification,
  ) {
    if (bannerTimerRef.current !== null) {
      window.clearTimeout(bannerTimerRef.current);
    }
    setBanner({ text, type, notification });
    bannerTimerRef.current = window.setTimeout(
      () => setBanner(null),
      notification ? 6000 : 3500,
    );
  }

  // ── Auth bootstrap ──────────────────────────────────────────────────────
  useEffect(() => {
    async function boot() {
      // 0. Stash pending group join from continueUrl before auth clears the URL
      const rawParams = new URLSearchParams(window.location.search);
      const pendingJoin = rawParams.get("joinGroupId");
      if (pendingJoin) localStorage.setItem("pendingJoinGroupId", pendingJoin);
      const pendingClaimMember = rawParams.get("claimMemberId");
      const pendingClaimCode = rawParams.get("claimCode");
      if (pendingClaimMember) {
        localStorage.setItem("pendingClaimMemberId", pendingClaimMember);
      }
      if (pendingClaimCode) localStorage.setItem("pendingClaimCode", pendingClaimCode);

      // 1. Magic link callback?
      if (isMagicLink()) {
        const email = (localStorage.getItem("emailForSignIn") ?? "").trim();
        if (!email) {
          setAuthState("needs_link_email");
          return;
        }

        try {
          let user;
          try {
            user = await completeMagicLink(email);
          } catch (error) {
            const message = error instanceof Error ? error.message.toLowerCase() : "";
            const code = typeof error === "object" && error !== null && "code" in error
              ? String((error as { code?: unknown }).code)
              : "";
            const emailMismatch =
              message.includes("email provided does not match") ||
              message.includes("email address does not match") ||
              code === "auth/invalid-email";

            if (!emailMismatch) throw error;

            // A prior sign-in attempt can leave a different address in this
            // browser. Discard it and show the secure in-app confirmation form.
            localStorage.removeItem("emailForSignIn");
            setLinkEmailError(
              "That email does not match this magic link. Enter the address that received it.",
            );
            setAuthState("needs_link_email");
            return;
          }
          const newSession = saveSession(user);
          setSession(newSession);

          if (!user.displayName) {
            setAuthState("needs_profile");
          } else {
            setCurrentUser(sessionToCurrentUser(newSession));
            setAuthState("authenticated");
          }

          // Clean Firebase's magic-link params while preserving a requested
          // Quick Add group from the Shortcut URL.
          const cleanUrl = new URL(window.location.pathname, window.location.origin);
          const quickAddGroupId = rawParams.get("group");
          if (isQuickAddPath(window.location.pathname) && quickAddGroupId) {
            cleanUrl.searchParams.set("group", quickAddGroupId);
          }
          window.history.replaceState(
            {},
            "",
            `${cleanUrl.pathname}${cleanUrl.search}`,
          );
          return;
        } catch (err) {
          showBanner(
            err instanceof Error && err.message.toLowerCase().includes("email")
              ? "That email does not match this magic link. Reload the page and enter the exact address that received it."
              : err instanceof Error
                ? err.message
                : "Sign-in failed",
            "error",
          );
          setAuthState("unauthenticated");
          // Keep the link parameters so a mistyped email can be retried after reload.
          return;
        }
      }

      // 2. Existing session?
      const existing = loadSession();
      if (existing) {
        const idToken = await getValidIdToken();
        if (idToken) {
          setSession(existing);
          setCurrentUser(sessionToCurrentUser(existing));
          setAuthState("authenticated");
          return;
        }
      }

      setAuthState("unauthenticated");
    }

    boot();
  }, []);

  // ── Load groups when authenticated ─────────────────────────────────────
  useEffect(() => {
    if (authState !== "authenticated" || !session) return;

    const params = new URLSearchParams(window.location.search);
    const joinId =
      params.get("joinGroupId") ?? localStorage.getItem("pendingJoinGroupId");
    if (joinId) {
      void handleJoinGroup(joinId, session).then((joined) => {
        if (!joined) return;
        clearPendingJoin();
        window.history.replaceState({}, "", window.location.pathname);
      });
    }

    fetchGroups(session.uid);
  }, [authState, session?.uid]);

  async function fetchGroups(uid: string) {
    setGroupsLoading(true);
    setProfileLoaded(false);
    try {
      const [loaded, profile] = await Promise.all([
        loadUserGroups(uid),
        loadOrCreateUserProfile(uid),
      ]);
      setGroups(loaded);
      setCurrentUser((user) =>
        user
          ? {
              ...user,
              name: profile.name ?? user.name,
              color: profile.color ?? user.color,
              avatarSeed: profile.avatarSeed,
              profileImageVersion: profile.profileImageVersion,
              notificationReadAt: profile.notificationReadAt,
              notificationPreferences: profile.notificationPreferences,
            }
          : user,
      );
      setProfileLoaded(true);
    } catch (err) {
      showBanner(errorMessage(err, "Unable to load groups"), "error");
    } finally {
      setGroupsLoading(false);
    }
  }

  async function saveGroupSafely(
    changed: Group,
    base: Group | null = groups.find((group) => group.id === changed.id) ?? null,
  ): Promise<Group> {
    if (!session) return changed;

    const latest = await fetchGroup(changed.id).catch(() => null);
    const groupToSave = latest
      ? mergeGroupChanges(base, changed, latest)
      : compactGroupHistory(changed);

    await saveGroup(groupToSave, session.uid);
    return groupToSave;
  }

  // ── Keep open group in sync ─────────────────────────────────────────────
  useEffect(() => {
    syncRef.current.unsubscribe?.();
    if (syncRef.current.poll) clearInterval(syncRef.current.poll);
    syncRef.current = {};
    if (screen !== "group" || !selectedGroup) return;

    const applyFreshGroup = (fresh: Group | null) => {
      if (!fresh) return;
      if (
        session &&
        !fresh.members.some(
          (member) => member.id === session.uid || member.uid === session.uid,
        )
      ) {
        setGroups((prev) => prev.filter((group) => group.id !== fresh.id));
        setSelectedGroup(null);
        setScreen("home");
        return;
      }
      setSelectedGroup(fresh);
      setGroups((prev) => prev.map((g) => (g.id === fresh.id ? fresh : g)));
    };

    const startFallbackPoll = () => {
      if (syncRef.current.poll) return;
      const poll = async () => {
        try {
          applyFreshGroup(await pollGroup(selectedGroup.id));
        } catch {}
      };
      poll();
      syncRef.current.poll = setInterval(poll, FALLBACK_POLL_MS);
    };

    try {
      syncRef.current.unsubscribe = subscribeGroup(
        selectedGroup.id,
        applyFreshGroup,
        startFallbackPoll,
      );
    } catch {
      startFallbackPoll();
    }

    return () => {
      syncRef.current.unsubscribe?.();
      if (syncRef.current.poll) clearInterval(syncRef.current.poll);
      syncRef.current = {};
    };
  }, [screen, selectedGroup?.id]);

  const backgroundGroupIds = groups
    .map((group) => group.id)
    .sort()
    .join("|");
  useEffect(() => {
    if (authState !== "authenticated") return;
    const foregroundGroupId =
      screen === "group" ? selectedGroup?.id : undefined;
    const unsubscribes = groups
      .filter((group) => group.id !== foregroundGroupId)
      .map((group) =>
        subscribeGroup(group.id, (fresh) => {
          if (!fresh) return;
          setGroups((current) =>
            current.map((item) => (item.id === fresh.id ? fresh : item)),
          );
        }),
      );
    return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
  }, [
    authState,
    backgroundGroupIds,
    screen,
    selectedGroup?.id,
  ]);

  useEffect(() => {
    if (authState !== "authenticated" || !session) return;

    const refreshOnFocus = () => {
      fetchGroups(session.uid);
    };

    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [authState, session?.uid]);

  // ── Join group helper ───────────────────────────────────────────────────
  async function handleJoinGroup(
    groupId: string,
    user: AuthUser,
    skipNameMatch = false,
    requestedPendingMemberId?: string,
  ): Promise<boolean> {
    try {
      const newSession = saveSession(user);
      const cu = sessionToCurrentUser(newSession);
      const savedProfile = await loadOrCreateUserProfile(user.uid);
      const colorIndex = user.uid.charCodeAt(0) % MEMBER_COLORS.length;
      const memberName = savedProfile.name ?? cu.name;
      const personalClaimMemberId =
        localStorage.getItem("pendingClaimMemberId") ?? undefined;
      if (!skipNameMatch && !personalClaimMemberId) {
        const preview = await fetchGroup(groupId);
        const alreadyJoined = preview?.members.some(
          (member) => member.uid === user.uid || member.id === user.uid,
        );
        const similarMember = preview && !alreadyJoined
          ? findSimilarPendingMember(preview, memberName)
          : undefined;
        if (preview && similarMember) {
          setSimilarMemberJoin({
            groupId,
            user,
            group: preview,
            member: similarMember,
          });
          return false;
        }
      }
      const joined = await joinGroup(
        groupId,
        user.uid,
        memberName,
        savedProfile.color ?? MEMBER_COLORS[colorIndex],
        savedProfile.avatarSeed,
        savedProfile.profileImageVersion,
        personalClaimMemberId,
        localStorage.getItem("pendingClaimCode") ?? undefined,
        requestedPendingMemberId,
      );
      if (joined) {
        const joinedMember = joined.members.find(
          (member) => member.uid === user.uid || member.id === user.uid,
        );
        if (joinedMember?.joinedAt) {
          void sendPushEvents(joined.id, [
            {
              type: "member_joined",
              entityId: joinedMember.id,
              occurredAt: joinedMember.joinedAt,
            },
          ]).catch((error) =>
            console.warn("Unable to send member notification", error),
          );
        }
        setGroups((prev) => {
          const existing = prev.find((g) => g.id === joined.id);
          return existing
            ? prev.map((g) => (g.id === joined.id ? joined : g))
            : [joined, ...prev];
        });
        setSelectedGroup(joined);
        setScreen("group");
        showBanner(`Joined "${joined.name}"!`);
        return true;
      } else {
        showBanner("Unable to find that group invite", "error");
        return false;
      }
    } catch (err) {
      showBanner(
        err instanceof Error ? err.message : "Unable to join group",
        "error",
      );
      return false;
    }
  }

  async function continueSimilarMemberJoin(requestClaim: boolean) {
    const pending = similarMemberJoin;
    if (!pending) return;
    setSimilarMemberJoin(null);
    const joined = await handleJoinGroup(
      pending.groupId,
      pending.user,
      true,
      requestClaim ? pending.member.id : undefined,
    );
    if (joined) {
      clearPendingJoin();
      window.history.replaceState({}, "", window.location.pathname);
      if (requestClaim) {
        showBanner(
          pending.group.autoApproveSimilarNameClaims
            ? "Joined the group and connected to your existing expenses"
            : "Joined the group — your connection request was sent to an admin",
        );
      }
    }
  }

  // ── Auth actions ────────────────────────────────────────────────────────
  async function finishSignIn(user: AuthUser) {
    const newSession = saveSession(user);
    setSession(newSession);

    if (!user.displayName) {
      setAuthState("needs_profile");
      return;
    }

    setCurrentUser(sessionToCurrentUser(newSession));
    setAuthState("authenticated");
  }

  async function handleGoogleSignIn(): Promise<AuthUser> {
    const user = await signInWithGoogle();
    await finishSignIn(user);
    return user;
  }

  async function handleCompleteProfile(name: string) {
    if (!session) return;
    await setDisplayName(session.idToken, name);
    const updatedSession = saveSession({ ...session, displayName: name });
    setSession(updatedSession);
    setCurrentUser(sessionToCurrentUser(updatedSession));
    setAuthState("authenticated");
  }

  async function handleLogout() {
    if (session) {
      await disablePushNotifications(session.uid).catch(() => {});
    }
    clearSession();
    signOut(auth).catch(() => {});
    setSession(null);
    setCurrentUser(null);
    setGroups([]);
    setProfileLoaded(false);
    setSystemAlertsPromptOpen(false);
    setSystemAlertsPromptError("");
    setSelectedGroup(null);
    setNotificationDestination(null);
    setScreen("home");
    setAuthState("unauthenticated");
    seenNotificationIdsRef.current = new Set();
    notificationStreamReadyRef.current = false;
  }

  function handleUpdateUser(updated: CurrentUser) {
    const displayNameChanged =
      !currentUser || currentUser.name !== updated.name;
    const identityChanged =
      !currentUser ||
      displayNameChanged ||
      currentUser.color !== updated.color ||
      currentUser.avatarSeed !== updated.avatarSeed ||
      currentUser.profileImageVersion !== updated.profileImageVersion;
    const notificationPreferencesChanged =
      JSON.stringify(
        normalizeNotificationPreferences(currentUser?.notificationPreferences),
      ) !==
      JSON.stringify(
        normalizeNotificationPreferences(updated.notificationPreferences),
      );
    const systemAlertsWereEnabled = normalizeNotificationPreferences(
      currentUser?.notificationPreferences,
    ).systemNotifications;
    const systemAlertsAreEnabled = normalizeNotificationPreferences(
      updated.notificationPreferences,
    ).systemNotifications;
    if (currentUser && systemAlertsWereEnabled !== systemAlertsAreEnabled) {
      if (systemAlertsAreEnabled) {
        localStorage.removeItem(
          systemAlertsPromptDismissedKey(currentUser.id),
        );
      } else {
        localStorage.setItem(
          systemAlertsPromptDismissedKey(currentUser.id),
          "true",
        );
      }
    }
    if (notificationPreferencesChanged) {
      // Re-baseline live alerts so enabling a category does not toast every
      // older unread item. Those items remain available in the inbox.
      notificationStreamReadyRef.current = false;
      void updatePushPreferences(
        normalizeNotificationPreferences(updated.notificationPreferences),
      ).catch((error) =>
        console.warn("Unable to update push preferences", error),
      );
    }
    setCurrentUser(updated);
    if (session) {
      const next = saveSession({
        ...session,
        displayName: updated.name,
        color: updated.color,
      });
      setSession(next);
      saveUserProfile(updated.id, {
        name: updated.name,
        color: updated.color,
        avatarSeed: updated.avatarSeed,
        profileImageVersion: updated.profileImageVersion ?? "",
        notificationReadAt: updated.notificationReadAt,
        notificationPreferences: updated.notificationPreferences,
      }).catch((err) => {
        showBanner(errorMessage(err, "Unable to save profile"), "error");
      });
      if (displayNameChanged) {
        setDisplayName(next.idToken, updated.name).catch((err) => {
          showBanner(errorMessage(err, "Unable to update profile name"), "error");
        });
      }

      if (!identityChanged) return;

      const affectedGroups: Group[] = [];
      const updatedGroups = groups.map((group) => {
        let changed = false;
        const members = group.members.map((member) => {
          if (member.id !== updated.id && member.uid !== updated.id) {
            return member;
          }

          changed = true;
          return {
            ...member,
            name: updated.name,
            color: updated.color,
            avatarSeed: updated.avatarSeed,
            profileImageVersion: updated.profileImageVersion,
          };
        });

        if (!changed) return group;

        const nextGroup = { ...group, members };
        affectedGroups.push(nextGroup);
        return nextGroup;
      });

      setGroups(updatedGroups);
      setSelectedGroup((selected) =>
        selected
          ? (updatedGroups.find((group) => group.id === selected.id) ?? selected)
          : selected,
      );
      Promise.all(
        affectedGroups.map((group) =>
          saveGroupSafely(
            group,
            groups.find((existing) => existing.id === group.id) ?? null,
          ),
        ),
      ).catch((err) => {
        showBanner(
          errorMessage(err, "Unable to sync profile changes to groups"),
          "error",
        );
      });
    }
  }

  // ── Group actions ───────────────────────────────────────────────────────
  async function handleCreateGroup(group: Group) {
    if (!session) return;
    try {
      const compactGroup = compactGroupHistory(group);
      await saveGroup(compactGroup, session.uid);
      setGroups((prev) => [compactGroup, ...prev]);
      setSelectedGroup(compactGroup);
      setScreen("group");
      showBanner(`Created "${group.name}"`);
    } catch (err) {
      showBanner(errorMessage(err, "Unable to create group"), "error");
    }
  }

  async function persistGroupUpdate(
    group: Group,
    base: Group | null,
  ): Promise<Group> {
    if (!session) throw new Error("Sign in again to save this expense.");
    const saved = await saveGroupSafely(group, base);
    const pushEvents = collectPushEvents(base, saved, session.uid);
    if (pushEvents.length > 0) {
      void sendPushEvents(saved.id, pushEvents).catch((error) =>
        console.warn("Unable to send push notification", error),
      );
    }
    setSelectedGroup((current) =>
      current?.id === saved.id ? saved : current,
    );
    setGroups((previous) =>
      previous.map((candidate) =>
        candidate.id === saved.id ? saved : candidate,
      ),
    );
    return saved;
  }

  async function handleUpdateGroup(group: Group) {
    if (!session) return;
    const base =
      selectedGroup?.id === group.id
        ? selectedGroup
        : (groups.find((existing) => existing.id === group.id) ?? null);
    try {
      await persistGroupUpdate(group, base);
    } catch (err) {
      showBanner(errorMessage(err, "Unable to save changes"), "error");
    }
  }

  async function handleQuickAddExpense(groupId: string, expense: Expense) {
    const base = groups.find((group) => group.id === groupId);
    if (!base) throw new Error("That group is no longer available.");
    await persistGroupUpdate(upsertExpense(base, expense), base);
  }

  async function handleDeleteGroup(groupId: string) {
    if (!session) return;
    try {
      await deleteGroup(groupId, session.uid);
      setGroups((prev) => prev.filter((g) => g.id !== groupId));
      setSelectedGroup(null);
      setScreen("home");
      showBanner("Group deleted");
    } catch (err) {
      showBanner(errorMessage(err, "Unable to delete group"), "error");
    }
  }

  const totalExpenses = groups.reduce((sum, g) => sum + g.expenses.length, 0);
  const notifications = useMemo(
    () =>
      currentUser
        ? deriveNotifications(
            groups,
            currentUser.id,
            currentUser.notificationPreferences,
          )
        : [],
    [currentUser, groups],
  );
  const unreadNotificationCount = notifications.filter((notification) =>
    isNotificationUnread(notification, currentUser?.notificationReadAt),
  ).length;

  useEffect(() => {
    if (!currentUser) {
      setSystemAlertsPromptOpen(false);
      return;
    }
    const availability = getPushAvailability();
    const dismissed =
      localStorage.getItem(systemAlertsPromptDismissedKey(currentUser.id)) ===
      "true";
    const shouldShow = shouldShowSystemAlertsPrompt({
      authenticated: authState === "authenticated",
      profileLoaded,
      onHomeScreen: screen === "home",
      available: availability.available,
      permission:
        "Notification" in window ? Notification.permission : "denied",
      systemNotificationsEnabled:
        normalizeNotificationPreferences(currentUser.notificationPreferences)
          .systemNotifications,
      dismissed,
    });

    if (!shouldShow) {
      setSystemAlertsPromptOpen(false);
      return;
    }
    const timer = window.setTimeout(() => {
      setSystemAlertsPromptError("");
      setSystemAlertsPromptOpen(true);
    }, SYSTEM_ALERTS_PROMPT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    authState,
    currentUser?.id,
    currentUser?.notificationPreferences?.systemNotifications,
    profileLoaded,
    screen,
  ]);

  function dismissSystemAlertsPrompt() {
    if (!currentUser || systemAlertsPromptSaving) return;
    localStorage.setItem(
      systemAlertsPromptDismissedKey(currentUser.id),
      "true",
    );
    setSystemAlertsPromptOpen(false);
    setSystemAlertsPromptError("");
  }

  async function enableSystemAlertsFromPrompt() {
    if (!currentUser || systemAlertsPromptSaving) return;
    setSystemAlertsPromptSaving(true);
    setSystemAlertsPromptError("");
    try {
      const preferences = {
        ...normalizeNotificationPreferences(
          currentUser.notificationPreferences,
        ),
        systemNotifications: true,
      };
      await enablePushNotifications(currentUser.id, preferences);
      localStorage.removeItem(
        systemAlertsPromptDismissedKey(currentUser.id),
      );
      handleUpdateUser({
        ...currentUser,
        notificationPreferences: preferences,
      });
      setSystemAlertsPromptOpen(false);
      showBanner("System alerts enabled");
    } catch (error) {
      setSystemAlertsPromptError(
        errorMessage(error, "Unable to enable system alerts."),
      );
    } finally {
      setSystemAlertsPromptSaving(false);
    }
  }

  useEffect(() => {
    if (
      authState !== "authenticated" ||
      !currentUser?.notificationPreferences?.systemNotifications
    ) {
      return;
    }
    void syncPushNotifications(
      currentUser.id,
      normalizeNotificationPreferences(currentUser.notificationPreferences),
    ).catch((error) =>
      console.warn("Unable to refresh this device's push token", error),
    );
  }, [
    authState,
    currentUser?.id,
    currentUser?.notificationPreferences?.systemNotifications,
  ]);

  useEffect(() => {
    if (!currentUser?.notificationReadAt) return;
    const currentIds = new Set(
      notifications.map((notification) => notification.id),
    );
    if (!notificationStreamReadyRef.current) {
      seenNotificationIdsRef.current = currentIds;
      notificationStreamReadyRef.current = true;
      return;
    }

    const newNotifications = notifications.filter(
      (notification) =>
        !seenNotificationIdsRef.current.has(notification.id) &&
        isNotificationUnread(notification, currentUser.notificationReadAt),
    );
    seenNotificationIdsRef.current = currentIds;
    const latest = newNotifications[0];
    if (!latest) return;

    if (document.visibilityState === "visible") {
      showBanner(`${latest.title} · ${latest.body}`, "success", latest);
      return;
    }
    if (
      !import.meta.env.VITE_PUSH_API_URL &&
      currentUser.notificationPreferences?.systemNotifications &&
      "Notification" in window &&
      Notification.permission === "granted" &&
      "serviceWorker" in navigator
    ) {
      navigator.serviceWorker.ready
        .then((registration) =>
          registration.showNotification(latest.title, {
            body: latest.body,
            icon: "/icons/icon-192.png",
            badge: "/icons/icon-192.png",
            tag: latest.id,
            data: { url: notificationUrl(latest) },
          }),
        )
        .catch(() => {});
    }
  }, [
    currentUser?.notificationReadAt,
    currentUser?.notificationPreferences?.systemNotifications,
    notifications,
  ]);

  useEffect(() => {
    const badgeNavigator = navigator as Navigator & {
      setAppBadge?: (contents?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    const update = unreadNotificationCount > 0
      ? badgeNavigator.setAppBadge?.(unreadNotificationCount)
      : badgeNavigator.clearAppBadge?.();
    update?.catch(() => {});
  }, [unreadNotificationCount]);

  function saveNotificationReadAt(readAt: string) {
    if (!currentUser) return;
    const nextReadAt =
      currentUser.notificationReadAt &&
      currentUser.notificationReadAt > readAt
        ? currentUser.notificationReadAt
        : readAt;
    setCurrentUser({ ...currentUser, notificationReadAt: nextReadAt });
    saveUserProfile(currentUser.id, {
      notificationReadAt: nextReadAt,
    }).catch((err) => {
      showBanner(
        errorMessage(err, "Unable to update notifications"),
        "error",
      );
    });
  }

  function openNotification(notification: AppNotification) {
    const group = groups.find(
      (candidate) => candidate.id === notification.groupId,
    );
    if (!group) return;
    dismissBanner();
    if (quickAddRoute) {
      window.history.replaceState({}, "", "/");
      setQuickAddRoute(false);
    }
    saveNotificationReadAt(notification.at);
    setSelectedGroup(group);
    setNotificationDestination(notification.destination);
    setScreen("group");
  }

  useEffect(() => {
    if (authState !== "authenticated" || groups.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const groupId = params.get("openGroup");
    if (!groupId) return;
    const key = params.toString();
    if (handledDeepLinkRef.current === key) return;
    const group = groups.find((candidate) => candidate.id === groupId);
    if (!group) return;

    const tabValue = params.get("tab");
    const tab =
      tabValue === "balances" ||
      tabValue === "settle" ||
      tabValue === "chat"
        ? tabValue
        : "expenses";
    handledDeepLinkRef.current = key;
    setSelectedGroup(group);
    setNotificationDestination({
      tab,
      expenseId: params.get("expense") ?? undefined,
      paymentId: params.get("payment") ?? undefined,
      messageId: params.get("message") ?? undefined,
      manageMembers: params.get("members") === "1",
    });
    setScreen("group");
    window.history.replaceState({}, "", window.location.pathname);
  }, [authState, groups]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="size-full flex justify-center bg-background sm:bg-muted overflow-hidden">
      <div
        className={`w-full h-full relative overflow-hidden bg-background flex flex-col sm:shadow-2xl transition-[max-width] duration-300 ${
          authState === "unauthenticated" ? "sm:max-w-6xl" : "sm:max-w-sm"
        }`}
      >
        {/* Banner */}
        {banner && (
          <div
            className={`absolute top-0 left-0 right-0 z-50 flex items-center gap-3 px-4 py-3 text-sm font-medium text-white shadow-lg transition-all ${
              banner.type === "error" ? "bg-destructive" : ""
            }`}
            style={
              banner.type === "success"
                ? { backgroundColor: "var(--primary)" }
                : undefined
            }
          >
            {banner.notification ? (
              <button
                type="button"
                onClick={() => openNotification(banner.notification!)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
                aria-label={`Open notification: ${banner.notification.title}`}
              >
                <span aria-hidden="true">🔔</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">
                    {banner.notification.title}
                  </span>
                  <span className="block truncate text-xs text-white/85">
                    {banner.notification.body}
                  </span>
                </span>
                <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold">
                  View
                </span>
              </button>
            ) : (
              <span className="flex-1 text-center">
                {banner.type === "success" ? "🎉 " : "⚠️ "}
                {banner.text}
              </span>
            )}
          </div>
        )}

        {waitingUpdate && (
          <div
            className="absolute bottom-4 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 items-center gap-3 rounded-2xl border border-border bg-card p-4 text-card-foreground shadow-2xl"
            role="status"
            aria-live="polite"
          >
            <div className="min-w-0 flex-1">
              <p className="font-semibold">Update available</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Restart to use the latest version.
              </p>
            </div>
            <button
              type="button"
              disabled={restartingForUpdate}
              onClick={() => {
                setRestartingForUpdate(true);
                restartWithPwaUpdate(waitingUpdate);
              }}
              className="shrink-0 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
            >
              {restartingForUpdate ? "Restarting…" : "Restart"}
            </button>
          </div>
        )}

        {similarMemberJoin && (
          <SimilarMemberPrompt
            open
            group={similarMemberJoin.group}
            member={similarMemberJoin.member}
            autoApprove={!!similarMemberJoin.group.autoApproveSimilarNameClaims}
            onRequestClaim={() => void continueSimilarMemberJoin(true)}
            onJoinAsNew={() => void continueSimilarMemberJoin(false)}
            onCancel={() => {
              setSimilarMemberJoin(null);
              clearPendingJoin();
              window.history.replaceState({}, "", window.location.pathname);
            }}
          />
        )}

        <SystemAlertsPrompt
          open={systemAlertsPromptOpen}
          saving={systemAlertsPromptSaving}
          error={systemAlertsPromptError}
          onEnable={enableSystemAlertsFromPrompt}
          onDismiss={dismissSystemAlertsPrompt}
        />

        {/* Branded startup splash */}
        {(authState === "loading" || !splashMinimumElapsed) && (
          <div className="absolute inset-0 z-40 flex flex-col items-center justify-center bg-background overflow-hidden">
            <div className="absolute inset-x-10 top-1/2 h-56 -translate-y-1/2 rounded-full bg-accent/70 blur-3xl" />
            <div className="relative flex flex-col items-center animate-in fade-in zoom-in-95 duration-500">
              <BrandMark className="w-24 h-24 rounded-[1.7rem] shadow-xl shadow-primary/20" />
              <BrandWordmark className="mt-6 text-[1.8rem] text-foreground" />
              <p className="mt-3 text-sm text-muted-foreground">
                Split together. Settle simply.
              </p>
              <div className="mt-8 flex items-center gap-1.5" aria-label="Loading">
                <span className="size-2 rounded-full bg-primary/35 animate-pulse" />
                <span className="size-2 rounded-full bg-primary/65 animate-pulse [animation-delay:150ms]" />
                <span className="size-2 rounded-full bg-primary animate-pulse [animation-delay:300ms]" />
              </div>
            </div>
          </div>
        )}

        {splashMinimumElapsed && authState === "unauthenticated" && (
          <LoginScreen
            onProfileNeeded={() => {}}
            onGoogleSignIn={handleGoogleSignIn}
          />
        )}

        {splashMinimumElapsed && authState === "needs_link_email" && (
          <MagicLinkEmailScreen
            error={linkEmailError}
            onContinue={(email) => {
              localStorage.setItem("emailForSignIn", email);
              window.location.reload();
            }}
          />
        )}

        {splashMinimumElapsed && authState === "needs_profile" && session && (
          <CompleteProfileScreen
            email={session.email}
            onComplete={handleCompleteProfile}
          />
        )}

        {splashMinimumElapsed && authState === "authenticated" && currentUser && (
          quickAddRoute ? (
            <QuickAddScreen
              groups={groups}
              currentUser={currentUser}
              loading={groupsLoading || !profileLoaded}
              onAddExpense={handleQuickAddExpense}
              onClose={() => {
                window.history.replaceState({}, "", "/");
                setQuickAddRoute(false);
                setScreen("home");
              }}
            />
          ) : (
            <>
            {screen === "profile" && (
              <ProfileScreen
                user={currentUser}
                groups={groups}
                groupCount={groups.length}
                expenseCount={totalExpenses}
                onBack={() => setScreen("home")}
                onLogout={handleLogout}
                onUpdateUser={handleUpdateUser}
              />
            )}
            {screen === "group" && selectedGroup && (
              <GroupScreen
                group={selectedGroup}
                currentUser={currentUser}
                destination={notificationDestination}
                onBack={() => {
                  setNotificationDestination(null);
                  setScreen("home");
                }}
                onUpdate={handleUpdateGroup}
                onDelete={handleDeleteGroup}
              />
            )}
            {screen === "home" && (
              <HomeScreen
                groups={groups}
                user={currentUser}
                notifications={notifications}
                notificationReadAt={currentUser.notificationReadAt}
                onOpenNotification={openNotification}
                onMarkAllNotificationsRead={() =>
                  saveNotificationReadAt(new Date().toISOString())
                }
                onSelectGroup={(g) => {
                  setSelectedGroup(groups.find((group) => group.id === g.id) ?? g);
                  setNotificationDestination(null);
                  setScreen("group");
                }}
                onCreateGroup={handleCreateGroup}
                onOpenProfile={() => setScreen("profile")}
              />
            )}
            </>
          )
        )}
      </div>
    </div>
  );
}
