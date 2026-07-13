import { useState, useEffect, useRef } from "react";
import type { Group, CurrentUser } from "./components/types";
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
  loadUserProfile,
  saveUserProfile,
} from "../lib/groupService";
import { MEMBER_COLORS } from "./components/utils";
import { compactGroupHistory, mergeGroupChanges } from "./components/groupMerge";
import { HomeScreen } from "./components/HomeScreen";
import { GroupScreen } from "./components/GroupScreen";
import { LoginScreen, CompleteProfileScreen } from "./components/LoginScreen";
import { ProfileScreen } from "./components/ProfileScreen";
import { BrandMark, BrandWordmark } from "./components/Brand";
import { auth } from "../lib/firebase";
import { signOut } from "firebase/auth";

/* MARKER-MAKE-KIT-INVOKED */

type AuthState =
  | "loading"
  | "unauthenticated"
  | "needs_profile"
  | "authenticated";
type Screen = "home" | "group" | "profile";

const FALLBACK_POLL_MS = 3000;
const SPLASH_MIN_MS = 1200;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

function clearPendingJoin() {
  localStorage.removeItem("pendingJoinGroupId");
  localStorage.removeItem("pendingClaimMemberId");
  localStorage.removeItem("pendingClaimCode");
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [session, setSession] = useState<Session | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [banner, setBanner] = useState<{
    text: string;
    type: "success" | "error";
  } | null>(null);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [splashMinimumElapsed, setSplashMinimumElapsed] = useState(false);
  const syncRef = useRef<{
    unsubscribe?: () => void;
    poll?: ReturnType<typeof setInterval>;
  }>({});

  useEffect(() => {
    const timer = window.setTimeout(
      () => setSplashMinimumElapsed(true),
      SPLASH_MIN_MS,
    );
    return () => window.clearTimeout(timer);
  }, []);

  // ── Banner helper ───────────────────────────────────────────────────────
  function showBanner(text: string, type: "success" | "error" = "success") {
    setBanner({ text, type });
    setTimeout(() => setBanner(null), 3500);
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
        let email = localStorage.getItem("emailForSignIn") ?? "";
        if (!email) {
          email = window.prompt("Enter your email to complete sign-in:") ?? "";
        }
        if (!email) {
          setAuthState("unauthenticated");
          return;
        }

        try {
          const user = await completeMagicLink(email);
          const newSession = saveSession(user);
          setSession(newSession);

          // Check for pending group join encoded in continueUrl
          const joinId = localStorage.getItem("pendingJoinGroupId");

          if (!user.displayName) {
            setAuthState("needs_profile");
          } else {
            setCurrentUser(sessionToCurrentUser(newSession));
            setAuthState("authenticated");

            if (joinId) {
              await handleJoinGroup(joinId, user);
              clearPendingJoin();
            }
          }

          // Clean magic-link params from URL
          window.history.replaceState({}, "", window.location.pathname);
          return;
        } catch (err) {
          showBanner(
            err instanceof Error ? err.message : "Sign-in failed",
            "error",
          );
          setAuthState("unauthenticated");
          window.history.replaceState({}, "", window.location.pathname);
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
      handleJoinGroup(joinId, session).finally(() => {
        clearPendingJoin();
      });
      window.history.replaceState({}, "", window.location.pathname);
    }

    fetchGroups(session.uid);
  }, [authState, session?.uid]);

  async function fetchGroups(uid: string) {
    setGroupsLoading(true);
    try {
      const [loaded, profile] = await Promise.all([
        loadUserGroups(uid),
        loadUserProfile(uid),
      ]);
      setGroups(loaded);
      setCurrentUser((user) =>
        user
          ? {
              ...user,
              name: profile.name ?? user.name,
              color: profile.color ?? user.color,
              avatarSeed: profile.avatarSeed,
            }
          : user,
      );
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
  ) {
    const newSession = saveSession(user);
    const cu = sessionToCurrentUser(newSession);
    const savedProfile = await loadUserProfile(user.uid).catch(() => ({}));
    const colorIndex = user.uid.charCodeAt(0) % MEMBER_COLORS.length;

    try {
      const joined = await joinGroup(
        groupId,
        user.uid,
        cu.name,
        savedProfile.color ?? MEMBER_COLORS[colorIndex],
        savedProfile.avatarSeed,
        localStorage.getItem("pendingClaimMemberId") ?? undefined,
        localStorage.getItem("pendingClaimCode") ?? undefined,
      );
      if (joined) {
        setGroups((prev) => {
          const existing = prev.find((g) => g.id === joined.id);
          return existing
            ? prev.map((g) => (g.id === joined.id ? joined : g))
            : [joined, ...prev];
        });
        setSelectedGroup(joined);
        setScreen("group");
        showBanner(`Joined "${joined.name}"!`);
      } else {
        showBanner("Unable to find that group invite", "error");
      }
    } catch (err) {
      showBanner(
        err instanceof Error ? err.message : "Unable to join group",
        "error",
      );
    }
  }

  // ── Auth actions ────────────────────────────────────────────────────────
  async function finishSignIn(user: AuthUser) {
    const newSession = saveSession(user);
    setSession(newSession);

    const joinId = localStorage.getItem("pendingJoinGroupId");
    if (!user.displayName) {
      setAuthState("needs_profile");
      return;
    }

    setCurrentUser(sessionToCurrentUser(newSession));
    setAuthState("authenticated");

    if (joinId) {
      await handleJoinGroup(joinId, user);
      clearPendingJoin();
    }
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

    const joinId = localStorage.getItem("pendingJoinGroupId");
    if (joinId) {
      await handleJoinGroup(joinId, updatedSession);
      clearPendingJoin();
    }
  }

  function handleLogout() {
    clearSession();
    signOut(auth).catch(() => {});
    setSession(null);
    setCurrentUser(null);
    setGroups([]);
    setSelectedGroup(null);
    setScreen("home");
    setAuthState("unauthenticated");
  }

  function handleUpdateUser(updated: CurrentUser) {
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
      }).catch((err) => {
        showBanner(errorMessage(err, "Unable to save profile"), "error");
      });
      setDisplayName(next.idToken, updated.name).catch((err) => {
        showBanner(errorMessage(err, "Unable to update profile name"), "error");
      });

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

  async function handleUpdateGroup(group: Group) {
    if (!session) return;
    try {
      const base =
        selectedGroup?.id === group.id
          ? selectedGroup
          : (groups.find((existing) => existing.id === group.id) ?? null);
      const saved = await saveGroupSafely(group, base);
      setSelectedGroup(saved);
      setGroups((prev) => prev.map((g) => (g.id === saved.id ? saved : g)));
    } catch (err) {
      showBanner(errorMessage(err, "Unable to save changes"), "error");
    }
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

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="size-full flex justify-center bg-background sm:bg-muted overflow-hidden">
      <div className="w-full h-full sm:max-w-sm relative overflow-hidden bg-background flex flex-col sm:shadow-2xl">
        {/* Banner */}
        {banner && (
          <div
            className={`absolute top-0 left-0 right-0 z-50 flex items-center justify-center py-3 px-4 text-sm font-medium text-white transition-all ${
              banner.type === "error" ? "bg-destructive" : ""
            }`}
            style={
              banner.type === "success"
                ? { backgroundColor: "var(--primary)" }
                : undefined
            }
          >
            {banner.type === "success" ? "🎉 " : "⚠️ "}
            {banner.text}
          </div>
        )}

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

        {splashMinimumElapsed && authState === "needs_profile" && session && (
          <CompleteProfileScreen
            email={session.email}
            onComplete={handleCompleteProfile}
          />
        )}

        {splashMinimumElapsed && authState === "authenticated" && currentUser && (
          <>
            {screen === "profile" && (
              <ProfileScreen
                user={currentUser}
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
                onBack={() => setScreen("home")}
                onUpdate={handleUpdateGroup}
                onDelete={handleDeleteGroup}
              />
            )}
            {screen === "home" && (
              <HomeScreen
                groups={groups}
                user={currentUser}
                onSelectGroup={(g) => {
                  setSelectedGroup(groups.find((group) => group.id === g.id) ?? g);
                  setScreen("group");
                }}
                onCreateGroup={handleCreateGroup}
                onOpenProfile={() => setScreen("profile")}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
