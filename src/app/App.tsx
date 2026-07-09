import { useState, useEffect, useRef } from "react";
import type { Group, CurrentUser } from "./components/types";
import {
  isMagicLink,
  completeMagicLink,
  setDisplayName,
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
  pollGroup,
  subscribeGroup,
} from "../lib/groupService";
import { MEMBER_COLORS } from "./components/utils";
import { HomeScreen } from "./components/HomeScreen";
import { GroupScreen } from "./components/GroupScreen";
import { LoginScreen, CompleteProfileScreen } from "./components/LoginScreen";
import { ProfileScreen } from "./components/ProfileScreen";

/* MARKER-MAKE-KIT-INVOKED */

type AuthState =
  | "loading"
  | "unauthenticated"
  | "needs_profile"
  | "authenticated";
type Screen = "home" | "group" | "profile";

const FALLBACK_POLL_MS = 3000;

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
  const syncRef = useRef<{
    unsubscribe?: () => void;
    poll?: ReturnType<typeof setInterval>;
  }>({});

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
              localStorage.removeItem("pendingJoinGroupId");
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

    // Check if the URL carries a plain ?join= group payload (QR / direct link)
    const params = new URLSearchParams(window.location.search);
    const joinParam = params.get("join");
    if (joinParam) {
      try {
        const decoded: Group = JSON.parse(decodeURIComponent(atob(joinParam)));
        handleJoinGroup(decoded.id, session, decoded);
      } catch {}
      window.history.replaceState({}, "", window.location.pathname);
    }

    fetchGroups(session.uid);
  }, [authState, session?.uid]);

  async function fetchGroups(uid: string) {
    setGroupsLoading(true);
    try {
      const loaded = await loadUserGroups(uid);
      setGroups(loaded);
    } catch {
      // silently fall back to empty
    } finally {
      setGroupsLoading(false);
    }
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
    fallbackGroup?: Group,
  ) {
    const newSession = saveSession(user);
    const cu = sessionToCurrentUser(newSession);
    const colorIndex = user.uid.charCodeAt(0) % MEMBER_COLORS.length;

    try {
      const joined = await joinGroup(
        groupId,
        user.uid,
        cu.name,
        MEMBER_COLORS[colorIndex],
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
      }
    } catch {
      // If Firestore fails but we have the decoded group, fall back to local join
      if (fallbackGroup) {
        setGroups((prev) =>
          prev.find((g) => g.id === fallbackGroup.id)
            ? prev
            : [fallbackGroup, ...prev],
        );
        setSelectedGroup(fallbackGroup);
        setScreen("group");
        showBanner(`Joined "${fallbackGroup.name}"!`);
      }
    }
  }

  // ── Auth actions ────────────────────────────────────────────────────────
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
      localStorage.removeItem("pendingJoinGroupId");
    }
  }

  function handleLogout() {
    clearSession();
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
      setDisplayName(next.idToken, updated.name).catch(() => {});

      const affectedGroups: Group[] = [];
      const updatedGroups = groups.map((group) => {
        let changed = false;
        const members = group.members.map((member) => {
          if (member.id !== updated.id && member.uid !== updated.id) {
            return member;
          }

          changed = true;
          return { ...member, name: updated.name, color: updated.color };
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
        affectedGroups.map((group) => saveGroup(group, session.uid)),
      ).catch(() => {});
    }
  }

  // ── Group actions ───────────────────────────────────────────────────────
  async function handleCreateGroup(group: Group) {
    if (!session) return;
    await saveGroup(group, session.uid);
    setGroups((prev) => [group, ...prev]);
    setSelectedGroup(group);
    setScreen("group");
  }

  async function handleUpdateGroup(group: Group) {
    if (!session) return;
    await saveGroup(group, session.uid);
    setSelectedGroup(group);
    setGroups((prev) => prev.map((g) => (g.id === group.id ? group : g)));
  }

  async function handleDeleteGroup(groupId: string) {
    if (!session) return;
    await deleteGroup(groupId, session.uid);
    setGroups((prev) => prev.filter((g) => g.id !== groupId));
    setSelectedGroup(null);
    setScreen("home");
  }

  const totalExpenses = groups.reduce((sum, g) => sum + g.expenses.length, 0);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="size-full flex justify-center bg-muted overflow-hidden">
      <div className="w-full max-w-sm h-full relative overflow-hidden bg-background flex flex-col shadow-2xl">
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

        {/* Loading */}
        {authState === "loading" && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "var(--primary)" }}
            >
              <span className="text-2xl">💸</span>
            </div>
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {authState === "unauthenticated" && (
          <LoginScreen onProfileNeeded={() => {}} />
        )}

        {authState === "needs_profile" && session && (
          <CompleteProfileScreen
            email={session.email}
            onComplete={handleCompleteProfile}
          />
        )}

        {authState === "authenticated" && currentUser && (
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
