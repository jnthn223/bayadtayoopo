// Auth session stored in localStorage. Firebase Auth refreshes SDK tokens.

import type { AuthUser } from "./firebaseRest";
import { auth } from "./firebase";
import { MEMBER_COLORS } from "../app/components/utils";
import type { CurrentUser } from "../app/components/types";

const KEY = "splitwave_session";

export interface Session extends AuthUser {
  expiresAt: number; // epoch ms
}

export function saveSession(user: AuthUser): Session {
  const session: Session = { ...user, expiresAt: Date.now() + 55 * 60 * 1000 }; // 55 min
  localStorage.setItem(KEY, JSON.stringify(session));
  // Firebase recommends clearing the temporary email after an email-link sign-in.
  // Clearing it for every successful sign-in also prevents Google sessions from
  // leaving an unrelated address behind for a future invitation link.
  localStorage.removeItem("emailForSignIn");
  return session;
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
}

export async function getValidIdToken(): Promise<string | null> {
  const session = loadSession();
  if (!session) return null;

  try {
    await auth.authStateReady();
    const user = auth.currentUser;
    if (!user || user.uid !== session.uid) {
      clearSession();
      return null;
    }

    const idToken = await user.getIdToken();
    saveSession({
      ...session,
      idToken,
      refreshToken: user.refreshToken,
      displayName: user.displayName ?? session.displayName,
    });
    return idToken;
  } catch {
    if (
      typeof navigator !== "undefined" &&
      !navigator.onLine &&
      auth.currentUser?.uid === session.uid
    ) {
      return session.idToken;
    }

    clearSession();
    return null;
  }
}

export function sessionToCurrentUser(session: Session): CurrentUser {
  const colorIndex = session.uid.charCodeAt(0) % MEMBER_COLORS.length;
  return {
    id: session.uid,
    name: session.displayName ?? session.email.split("@")[0],
    email: session.email,
    color: session.color ?? MEMBER_COLORS[colorIndex],
  };
}
