import { useState, useEffect } from "react";
import {
  onAuthStateChanged,
  isSignInWithEmailLink,
  signInWithEmailLink,
  updateProfile,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../lib/firebase";
import {
  subscribeToUserGroups,
  saveGroup,
  migrateLocalGroupsToFirestore,
} from "../lib/groups";
import type { Group, CurrentUser } from "./components/types";
import { decodeGroupFromUrl, MEMBER_COLORS } from "./components/utils";
import { HomeScreen } from "./components/HomeScreen";
import { GroupScreen } from "./components/GroupScreen";
import { LoginScreen, CompleteProfileScreen } from "./components/LoginScreen";
import { ProfileScreen } from "./components/ProfileScreen";

/* MARKER-MAKE-KIT-INVOKED */

type Screen = "home" | "group" | "profile";
type AuthState = "loading" | "unauthenticated" | "needs_profile" | "authenticated";

function firebaseUserToCurrentUser(fbUser: User): CurrentUser {
  const colorIndex = fbUser.uid.charCodeAt(0) % MEMBER_COLORS.length;
  return {
    id: fbUser.uid,
    name: fbUser.displayName ?? fbUser.email?.split("@")[0] ?? "User",
    email: fbUser.email ?? "",
    color: MEMBER_COLORS[colorIndex],
  };
}

export default function App() {
  const [authState, setAuthState] = useState<AuthState>("loading");
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(null);
  const [screen, setScreen] = useState<Screen>("home");
  const [joinBanner, setJoinBanner] = useState<string | null>(null);
  const [linkError, setLinkError] = useState("");
  const [dataError, setDataError] = useState("");

  // Handle magic link callback on page load
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let email = window.localStorage.getItem("emailForSignIn");
      if (!email) {
        // Fallback: prompt user for email if opened on a different device
        email = window.prompt("Please enter your email to complete sign-in:") ?? "";
      }
      if (email) {
        signInWithEmailLink(auth, email, window.location.href)
          .then(() => {
            window.localStorage.removeItem("emailForSignIn");
            window.history.replaceState({}, "", window.location.pathname);
          })
          .catch((err) => {
            setLinkError(err.message ?? "Magic link is invalid or expired.");
            setAuthState("unauthenticated");
          });
      }
    }
  }, []);

  // Firebase auth state listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (fbUser) {
        setFirebaseUser(fbUser);
        if (!fbUser.displayName) {
          setAuthState("needs_profile");
        } else {
          setCurrentUser(firebaseUserToCurrentUser(fbUser));
          setAuthState("authenticated");
        }
      } else {
        setFirebaseUser(null);
        setCurrentUser(null);
        setAuthState("unauthenticated");
      }
    });
    return unsub;
  }, []);

  // Subscribe to Firestore groups when authenticated
  useEffect(() => {
    if (authState !== "authenticated" || !firebaseUser) {
      setGroups([]);
      setGroupsLoading(false);
      return;
    }

    let unsub: (() => void) | undefined;
    let cancelled = false;

    async function init() {
      setGroupsLoading(true);
      setDataError("");
      try {
        await migrateLocalGroupsToFirestore(firebaseUser!.uid);
      } catch {
        // Ignore migration errors
      }
      if (cancelled) return;
      unsub = subscribeToUserGroups(
        firebaseUser!.uid,
        (nextGroups) => {
          setGroups(nextGroups);
          setGroupsLoading(false);
        },
        (err) => {
          setDataError(err.message ?? "Failed to load groups.");
          setGroupsLoading(false);
        },
      );
    }

    init();

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [authState, firebaseUser]);

  // Keep selected group in sync with Firestore updates
  useEffect(() => {
    if (!selectedGroup) return;
    const fresh = groups.find((g) => g.id === selectedGroup.id);
    if (fresh) setSelectedGroup(fresh);
  }, [groups, selectedGroup?.id]);

  // Handle join via URL (after auth is resolved)
  useEffect(() => {
    if (authState !== "authenticated" || !firebaseUser || groupsLoading) return;
    const params = new URLSearchParams(window.location.search);
    const joinData = params.get("join");
    if (!joinData) return;

    const incoming = decodeGroupFromUrl(joinData);
    if (!incoming) return;

    window.history.replaceState({}, "", window.location.pathname);

    const alreadyExists = groups.some((g) => g.id === incoming.id);
    if (alreadyExists) {
      const existing = groups.find((g) => g.id === incoming.id)!;
      setSelectedGroup(existing);
      setScreen("group");
      return;
    }

    saveGroup(firebaseUser.uid, incoming)
      .then(() => {
        setSelectedGroup(incoming);
        setScreen("group");
        setJoinBanner(`Joined "${incoming.name}"!`);
        setTimeout(() => setJoinBanner(null), 3000);
      })
      .catch((err) => {
        setDataError(err.message ?? "Failed to join group.");
      });
  }, [authState, firebaseUser, groupsLoading, groups]);

  async function handleCompleteProfile(name: string) {
    if (!firebaseUser) return;
    await updateProfile(firebaseUser, { displayName: name });
    // Re-read updated user
    const updated = firebaseUserToCurrentUser({ ...firebaseUser, displayName: name });
    setCurrentUser(updated);
    setAuthState("authenticated");
  }

  async function handleLogout() {
    await signOut(auth);
    setGroups([]);
    setScreen("home");
    setSelectedGroup(null);
  }

  function handleUpdateUser(updated: CurrentUser) {
    setCurrentUser(updated);
    if (firebaseUser) {
      updateProfile(firebaseUser, { displayName: updated.name }).catch(() => {});
    }
  }

  async function handleCreateGroup(group: Group) {
    if (!firebaseUser) return;
    try {
      await saveGroup(firebaseUser.uid, group);
      setSelectedGroup(group);
      setScreen("group");
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to create group.";
      setDataError(message);
    }
  }

  async function handleUpdateGroup(group: Group) {
    if (!firebaseUser) return;
    try {
      await saveGroup(firebaseUser.uid, group);
      setSelectedGroup(group);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save changes.";
      setDataError(message);
    }
  }

  const totalExpenses = groups.reduce((sum, g) => sum + g.expenses.length, 0);

  return (
    <div className="size-full flex justify-center bg-muted overflow-hidden">
      <div className="w-full max-w-sm h-full relative overflow-hidden bg-background flex flex-col shadow-2xl">

        {/* Join banner */}
        {joinBanner && (
          <div
            className="absolute top-0 left-0 right-0 z-50 flex items-center justify-center py-3 text-sm font-medium text-white"
            style={{ backgroundColor: "var(--primary)" }}
          >
            🎉 {joinBanner}
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

        {/* Error from bad magic link */}
        {authState === "unauthenticated" && linkError && (
          <div className="absolute top-4 left-4 right-4 z-50 bg-destructive text-white text-sm px-4 py-3 rounded-2xl">
            {linkError}
            <button className="ml-2 underline" onClick={() => setLinkError("")}>Dismiss</button>
          </div>
        )}

        {/* Unauthenticated */}
        {authState === "unauthenticated" && (
          <LoginScreen onProfileNeeded={() => {}} />
        )}

        {/* Needs display name */}
        {authState === "needs_profile" && firebaseUser && (
          <CompleteProfileScreen
            email={firebaseUser.email ?? ""}
            onComplete={handleCompleteProfile}
          />
        )}

        {/* Data sync error */}
        {authState === "authenticated" && dataError && (
          <div className="absolute top-4 left-4 right-4 z-50 bg-destructive text-white text-sm px-4 py-3 rounded-2xl">
            {dataError}
            <button className="ml-2 underline" onClick={() => setDataError("")}>Dismiss</button>
          </div>
        )}

        {/* Authenticated — loading groups */}
        {authState === "authenticated" && currentUser && groupsLoading && (
          <div className="flex-1 flex flex-col items-center justify-center gap-4">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-muted-foreground">Loading your groups…</p>
          </div>
        )}

        {/* Authenticated */}
        {authState === "authenticated" && currentUser && !groupsLoading && (
          <>
            {screen === "profile" ? (
              <ProfileScreen
                user={currentUser}
                groupCount={groups.length}
                expenseCount={totalExpenses}
                onBack={() => setScreen("home")}
                onLogout={handleLogout}
                onUpdateUser={handleUpdateUser}
              />
            ) : screen === "group" && selectedGroup ? (
              <GroupScreen
                group={selectedGroup}
                onBack={() => setScreen("home")}
                onUpdate={handleUpdateGroup}
              />
            ) : (
              <HomeScreen
                groups={groups}
                user={currentUser}
                onSelectGroup={(g) => { setSelectedGroup(g); setScreen("group"); }}
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
