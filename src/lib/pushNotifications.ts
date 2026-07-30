import {
  deleteToken,
  getMessaging,
  getToken,
  isSupported,
} from "firebase/messaging";
import { auth, app } from "./firebase";
import type { PushEvent } from "../app/components/pushEvents";
import type { NotificationPreferences } from "../app/components/types";
import { normalizeNotificationPreferences } from "../app/components/notifications";

const TOKEN_ID_KEY = "bayadtayoopo:push-token-id";
const PUSH_API_URL = import.meta.env.VITE_PUSH_API_URL?.trim();
const VAPID_KEY = import.meta.env.VITE_FIREBASE_VAPID_KEY?.trim();

export interface PushAvailability {
  available: boolean;
  reason?: string;
}

export function getPushAvailability(): PushAvailability {
  if (!PUSH_API_URL || !VAPID_KEY) {
    return {
      available: false,
      reason: "Push notifications have not been configured for this environment.",
    };
  }
  if (!("serviceWorker" in navigator) || !("Notification" in window)) {
    return {
      available: false,
      reason: "Push notifications are not supported in this browser.",
    };
  }
  return { available: true };
}

async function tokenDocumentId(token: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(token),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function pushApiRequest(
  path: string,
  method: string,
  body?: unknown,
): Promise<void> {
  if (!PUSH_API_URL) throw new Error("Push notifications are not configured.");
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) throw new Error("Sign in again to update push notifications.");
  const response = await fetch(
    `${PUSH_API_URL.replace(/\/$/, "")}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  if (!response.ok) {
    const result = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(result?.error ?? "Unable to update push notifications.");
  }
}

async function registerPushDevice(
  uid: string,
  preferences: NotificationPreferences,
  requestPermission: boolean,
): Promise<void> {
  void uid;
  const availability = getPushAvailability();
  if (!availability.available) throw new Error(availability.reason);
  if (!(await isSupported())) {
    throw new Error("Firebase push messaging is not supported in this browser.");
  }

  let permission = Notification.permission;
  if (permission === "default" && requestPermission) {
    permission = await Notification.requestPermission();
  }
  if (permission !== "granted") {
    throw new Error(
      permission === "denied"
        ? "Notifications are blocked in your browser settings."
        : "Notification permission was not granted.",
    );
  }

  const registration = await navigator.serviceWorker.ready;
  const messaging = getMessaging(app);
  const token = await getToken(messaging, {
    vapidKey: VAPID_KEY,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("The browser did not provide a push token.");

  const tokenId = await tokenDocumentId(token);
  const previousTokenId = localStorage.getItem(TOKEN_ID_KEY);
  if (previousTokenId && previousTokenId !== tokenId) {
    await pushApiRequest(
      `/devices/${encodeURIComponent(previousTokenId)}`,
      "DELETE",
    ).catch(() => {});
  }

  await pushApiRequest("/devices", "POST", {
    tokenId,
    token,
    platform: navigator.platform || "web",
    userAgent: navigator.userAgent.slice(0, 500),
    preferences: normalizeNotificationPreferences(preferences),
  });
  localStorage.setItem(TOKEN_ID_KEY, tokenId);
}

export function enablePushNotifications(
  uid: string,
  preferences: NotificationPreferences,
): Promise<void> {
  return registerPushDevice(uid, preferences, true);
}

export async function syncPushNotifications(
  uid: string,
  preferences: NotificationPreferences,
): Promise<void> {
  if (!("Notification" in window)) return;
  if (Notification.permission !== "granted") return;
  await registerPushDevice(uid, preferences, false);
}

export async function disablePushNotifications(uid: string): Promise<void> {
  void uid;
  const tokenId = localStorage.getItem(TOKEN_ID_KEY);
  if (tokenId) {
    await pushApiRequest(`/devices/${encodeURIComponent(tokenId)}`, "DELETE");
    localStorage.removeItem(TOKEN_ID_KEY);
  }
  if (!(await isSupported().catch(() => false))) return;
  await deleteToken(getMessaging(app)).catch(() => {});
}

export async function updatePushPreferences(
  preferences: NotificationPreferences,
): Promise<void> {
  if (!PUSH_API_URL) return;
  await pushApiRequest("/preferences", "PUT", {
    preferences: normalizeNotificationPreferences(preferences),
  });
}

export async function sendPushEvents(
  groupId: string,
  events: PushEvent[],
): Promise<void> {
  if (!PUSH_API_URL || events.length === 0 || !navigator.onLine) return;
  const idToken = await auth.currentUser?.getIdToken();
  if (!idToken) return;

  for (let index = 0; index < events.length; index += 20) {
    const response = await fetch(`${PUSH_API_URL.replace(/\/$/, "")}/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${idToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ groupId, events: events.slice(index, index + 20) }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(detail || `Push sender returned ${response.status}`);
    }
  }
}
