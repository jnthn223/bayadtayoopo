// Firebase REST API — no SDK, works in any sandboxed environment.

import {
  GoogleAuthProvider,
  signInWithEmailLink,
  signInWithPopup,
} from "firebase/auth";
import { auth } from "./firebase";

const API_KEY = import.meta.env.VITE_FIREBASE_API_KEY;

const PROJECT_ID = import.meta.env.VITE_FIREBASE_PROJECT_ID;

if (!API_KEY) {

  throw new Error("Missing VITE_FIREBASE_API_KEY");

}

if (!PROJECT_ID) {

  throw new Error("Missing VITE_FIREBASE_PROJECT_ID");

}

const AUTH_URL = `https://identitytoolkit.googleapis.com/v1/accounts`;
const TOKEN_URL = `https://securetoken.googleapis.com/v1/token`;
const FS_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

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

export async function refreshToken(refresh: string): Promise<Pick<AuthUser, "idToken" | "refreshToken">> {
  const res = await fetch(`${TOKEN_URL}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ grant_type: "refresh_token", refresh_token: refresh }),
  });
  const d = await res.json();
  if (!d.id_token) throw new Error("Token refresh failed");
  return { idToken: d.id_token, refreshToken: d.refresh_token };
}

export async function setDisplayName(idToken: string, displayName: string): Promise<void> {
  const res = await fetch(`${AUTH_URL}:update?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken, displayName, returnSecureToken: false }),
  });
  if (!res.ok) throw new Error("Failed to update name");
}

// ─── Firestore value codec ─────────────────────────────────────────────────

function encode(val: unknown): object {
  if (val === null || val === undefined) return { nullValue: null };
  if (typeof val === "boolean") return { booleanValue: val };
  if (typeof val === "number") return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  if (typeof val === "string") return { stringValue: val };
  if (Array.isArray(val)) return { arrayValue: { values: val.map(encode) } };
  if (typeof val === "object")
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(val as object).map(([k, v]) => [k, encode(v)])),
      },
    };
  return { stringValue: String(val) };
}

function decode(v: Record<string, unknown>): unknown {
  if ("nullValue" in v) return null;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("stringValue" in v) return v.stringValue;
  if ("arrayValue" in v) {
    const av = v.arrayValue as { values?: unknown[] };
    return (av.values ?? []).map((x) => decode(x as Record<string, unknown>));
  }
  if ("mapValue" in v) {
    const mv = v.mapValue as { fields?: Record<string, unknown> };
    return Object.fromEntries(
      Object.entries(mv.fields ?? {}).map(([k, fv]) => [k, decode(fv as Record<string, unknown>)])
    );
  }
  return null;
}

function docToObject(doc: Record<string, unknown>): Record<string, unknown> {
  const fields = doc.fields as Record<string, unknown> | undefined;
  if (!fields) return {};
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v as Record<string, unknown>)]));
}

// ─── Firestore CRUD ────────────────────────────────────────────────────────

export async function fsGet(path: string, idToken: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${FS_BASE}/${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore GET failed: ${res.status}`);
  const doc = await res.json();
  return docToObject(doc);
}

export async function fsSet(path: string, data: Record<string, unknown>, idToken: string): Promise<void> {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
  const res = await fetch(`${FS_BASE}/${path}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore SET failed: ${res.status}`);
}

export async function fsUpdate(path: string, data: Record<string, unknown>, idToken: string): Promise<void> {
  const fields = Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
  const updateMask = Object.keys(data).map((k) => `updateMask.fieldPaths=${k}`).join("&");
  const res = await fetch(`${FS_BASE}/${path}?${updateMask}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`Firestore UPDATE failed: ${res.status}`);
}

export async function fsDelete(path: string, idToken: string): Promise<void> {
  const res = await fetch(`${FS_BASE}/${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (!res.ok && res.status !== 404) {
    throw new Error(`Firestore DELETE failed: ${res.status}`);
  }
}

export async function fsGetMultiple(paths: string[], idToken: string): Promise<(Record<string, unknown> | null)[]> {
  if (paths.length === 0) return [];
  const docs = paths.map((p) => `projects/${PROJECT_ID}/databases/(default)/documents/${p}`);
  const res = await fetch(`${FS_BASE}:batchGet`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ documents: docs }),
  });
  if (!res.ok) return paths.map(() => null);
  const results: unknown[] = await res.json();
  return results.map((r: unknown) => {
    const result = r as Record<string, unknown>;
    if (result.found) return docToObject(result.found as Record<string, unknown>);
    return null;
  });
}
