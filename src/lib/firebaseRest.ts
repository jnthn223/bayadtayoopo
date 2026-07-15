// Authentication helpers. Firestore data access lives in the SDK-backed
// services so it can use persistent cache and queued offline writes.

import {
  GoogleAuthProvider,
  signInWithEmailLink,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "./firebase";

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;

if (!API_KEY) {
  throw new Error("Missing VITE_FIREBASE_API_KEY");
}

const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts`;

// ─── Auth types ────────────────────────────────────────────────────────────

export interface AuthUser {
  uid: string;
  email: string;
  displayName: string | null;
  color?: string;
  idToken: string;
  refreshToken: string;
}

// ─── Auth ──────────────────────────────────────────────────────────────────

export async function sendMagicLink(email: string, continueUrl: string): Promise<void> {
  const res = await fetch(`${AUTH_URL}:sendOobCode?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requestType: "EMAIL_SIGNIN",
      email,
      continueUrl,
      canHandleCodeInApp: true,
    }),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error?.message ?? "Failed to send link");
  }
}

export function isMagicLink(search = window.location.search): boolean {
  const p = new URLSearchParams(search);
  return p.get("mode") === "signIn" && !!p.get("oobCode");
}

export async function completeMagicLink(email: string, search = window.location.search): Promise<AuthUser> {
  const oobCode = new URLSearchParams(search).get("oobCode");
  if (!oobCode) throw new Error("No sign-in code in URL");

  const credential = await signInWithEmailLink(auth, email, window.location.href);
  const sdkUser = credential.user;
  const idToken = await sdkUser.getIdToken();
  let displayName = sdkUser.displayName || null;

  try {
    displayName = (await getDisplayName(idToken)) || displayName;
  } catch {
    // The sign-in token is still valid; a missing lookup should not block login.
  }

  return {
    uid: sdkUser.uid,
    email: sdkUser.email ?? email,
    displayName,
    idToken,
    refreshToken: sdkUser.refreshToken,
  };
}

export async function signInWithGoogle(): Promise<AuthUser> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  const credential = await signInWithPopup(auth, provider);
  const sdkUser = credential.user;
  const idToken = await sdkUser.getIdToken();
  let displayName = sdkUser.displayName || null;

  try {
    displayName = (await getDisplayName(idToken)) || displayName;
  } catch {
    // The sign-in token is still valid; a missing lookup should not block login.
  }

  const email = sdkUser.email;
  if (!email) throw new Error("Google account did not return an email address");

  return {
    uid: sdkUser.uid,
    email,
    displayName,
    idToken,
    refreshToken: sdkUser.refreshToken,
  };
}

async function getDisplayName(idToken: string): Promise<string | null> {
  const res = await fetch(`${AUTH_URL}:lookup?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;

  const d = await res.json();
  return d.users?.[0]?.displayName || null;
}

export async function setDisplayName(idToken: string, displayName: string): Promise<void> {
  const res = await fetch(`${AUTH_URL}:update?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, displayName, returnSecureToken: false }),
  });
  if (!res.ok) throw new Error("Failed to update name");
}
