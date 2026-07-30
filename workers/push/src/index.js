const encoder = new TextEncoder();
let cachedGoogleKeys;
let cachedAccessToken;

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function bytesToBase64Url(value) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function decodeJwtPart(value) {
  return JSON.parse(new TextDecoder().decode(base64UrlToBytes(value)));
}

async function googleSecureTokenKeys() {
  if (cachedGoogleKeys?.expiresAt > Date.now()) return cachedGoogleKeys.keys;
  const response = await fetch(
    "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
  );
  if (!response.ok) throw new Error("Unable to load Firebase signing keys");
  const body = await response.json();
  const maxAge = Number(
    response.headers.get("cache-control")?.match(/max-age=(\d+)/)?.[1] ?? 3600,
  );
  cachedGoogleKeys = {
    keys: body.keys,
    expiresAt: Date.now() + maxAge * 1000,
  };
  return body.keys;
}

async function verifyFirebaseIdToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed Firebase ID token");
  const header = decodeJwtPart(parts[0]);
  const payload = decodeJwtPart(parts[1]);
  const key = (await googleSecureTokenKeys()).find(
    (candidate) => candidate.kid === header.kid,
  );
  if (!key || header.alg !== "RS256") throw new Error("Unknown signing key");
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlToBytes(parts[2]),
    encoder.encode(`${parts[0]}.${parts[1]}`),
  );
  const now = Math.floor(Date.now() / 1000);
  if (
    !valid ||
    payload.aud !== projectId ||
    payload.iss !== `https://securetoken.google.com/${projectId}` ||
    typeof payload.sub !== "string" ||
    !payload.sub ||
    payload.exp <= now ||
    payload.iat > now + 300
  ) {
    throw new Error("Invalid Firebase ID token");
  }
  return payload;
}

function pemToBytes(pem) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  const binary = atob(body);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function serviceAccessToken(env) {
  if (cachedAccessToken?.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(
    encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })),
  );
  const claims = bytesToBase64Url(
    encoder.encode(
      JSON.stringify({
        iss: env.FIREBASE_CLIENT_EMAIL,
        scope: "https://www.googleapis.com/auth/firebase.messaging",
        aud: "https://oauth2.googleapis.com/token",
        iat: now,
        exp: now + 3600,
      }),
    ),
  );
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${bytesToBase64Url(
    new Uint8Array(signature),
  )}`;
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("Unable to authorize the push worker");
  const result = await response.json();
  cachedAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
  };
  return result.access_token;
}

function decodeFirestoreValue(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) {
    return (value.arrayValue.values ?? []).map(decodeFirestoreValue);
  }
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [
        key,
        decodeFirestoreValue(item),
      ]),
    );
  }
  return undefined;
}

function decodeDocument(document) {
  return Object.fromEntries(
    Object.entries(document?.fields ?? {}).map(([key, value]) => [
      key,
      decodeFirestoreValue(value),
    ]),
  );
}

function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(
    env.FIREBASE_PROJECT_ID,
  )}/databases/(default)/documents`;
}

async function firestoreFetch(env, path, firebaseIdToken) {
  return fetch(`${firestoreBase(env)}/${path}`, {
    headers: {
      Authorization: `Bearer ${firebaseIdToken}`,
    },
  });
}

function getMember(group, memberId) {
  return group.members.find(
    (member) => member.id === memberId || member.uid === memberId,
  );
}

function actorMatches(member, actorId) {
  return member && (member.id === actorId || member.uid === actorId);
}

function notificationUrl(groupId, tab, detail = {}) {
  const params = new URLSearchParams({ openGroup: groupId, tab });
  for (const [key, value] of Object.entries(detail)) {
    if (value) params.set(key, value);
  }
  return `/?${params.toString()}`;
}

function formatCurrency(amount, currency) {
  try {
    return new Intl.NumberFormat("en-PH", {
      style: "currency",
      currency: currency || "PHP",
    }).format(amount);
  } catch {
    return `${currency || "PHP"} ${Number(amount).toFixed(2)}`;
  }
}

export function validateAndBuild(group, event, actorUid) {
  const actor = group.members.find(
    (member) => member.uid === actorUid || member.id === actorUid,
  );
  if (!actor) throw new Error("The sender is not an active group member");
  const exactTime = (actual) => actual && actual === event.occurredAt;
  const allOthers = group.members.filter(
    (member) => member.uid && member.uid !== actorUid,
  );

  if (event.type === "chat_message") {
    const message = (group.messages ?? []).find(
      (item) => item.id === event.entityId,
    );
    if (
      !message ||
      !actorMatches(actor, message.memberId) ||
      !exactTime(message.createdAt)
    ) {
      throw new Error("Chat event does not match the saved group");
    }
    return {
      recipients: allOthers,
      preference: "chat",
      title: `${actor.name} in ${group.name}`,
      body: message.text,
      url: notificationUrl(group.id, "chat", { message: message.id }),
    };
  }

  if (
    event.type === "expense_created" ||
    event.type === "expense_updated"
  ) {
    const expense = group.expenses.find((item) => item.id === event.entityId);
    const actorId =
      event.type === "expense_created" ? expense?.createdBy : expense?.updatedBy;
    const occurredAt =
      event.type === "expense_created" ? expense?.createdAt : expense?.updatedAt;
    if (!expense || !actorMatches(actor, actorId) || !exactTime(occurredAt)) {
      throw new Error("Expense event does not match the saved group");
    }
    const involved = new Set([
      expense.paidBy,
      ...expense.splits.map((split) => split.memberId),
    ]);
    return {
      recipients: allOthers.filter(
        (member) => involved.has(member.id) || involved.has(member.uid),
      ),
      preference: "expenses",
      title:
        event.type === "expense_created"
          ? "New expense involving you"
          : "Expense updated",
      body: `${actor.name} ${
        event.type === "expense_created" ? "added" : "updated"
      } ${expense.description}`,
      url: notificationUrl(group.id, "expenses", { expense: expense.id }),
    };
  }

  if (event.type === "expense_deleted") {
    const expense = (group.deletedExpenses ?? []).find(
      (item) => item.expenseId === event.entityId,
    );
    if (
      !expense ||
      !actorMatches(actor, expense.deletedBy) ||
      !exactTime(expense.deletedAt)
    ) {
      throw new Error("Deleted-expense event does not match the saved group");
    }
    return {
      recipients: allOthers,
      preference: "expenses",
      title: "Expense deleted",
      body: `${actor.name} deleted ${expense.description}`,
      url: notificationUrl(group.id, "expenses"),
    };
  }

  if (event.type === "member_joined") {
    const member = getMember(group, event.entityId);
    if (
      !member ||
      member.uid !== actorUid ||
      !exactTime(member.joinedAt)
    ) {
      throw new Error("Member event does not match the saved group");
    }
    const adminIds = new Set([
      group.adminId ?? group.members[0]?.id,
      ...(group.adminIds ?? []),
    ]);
    return {
      recipients: allOthers.filter(
        (candidate) =>
          adminIds.has(candidate.id) || adminIds.has(candidate.uid),
      ),
      preference: "memberActivity",
      title: "Member joined",
      body: `${member.name} joined ${group.name}`,
      url: notificationUrl(group.id, "expenses"),
    };
  }

  const payment = (group.payments ?? []).find(
    (item) => item.id === event.entityId,
  );
  if (!payment) throw new Error("Payment event does not match the saved group");
  const from = getMember(group, payment.fromMemberId);
  const to = getMember(group, payment.toMemberId);
  const amount = formatCurrency(payment.amount, group.currency);
  const paymentUrl = notificationUrl(group.id, "settle", {
    payment: payment.id,
  });
  if (
    event.type === "payment_submitted" &&
    actorMatches(actor, payment.submittedBy) &&
    exactTime(payment.submittedAt)
  ) {
    return {
      recipients: to?.uid && to.uid !== actorUid ? [to] : [],
      preference: "payments",
      title: "Payment ready for review",
      body: `${from?.name ?? actor.name} submitted ${amount}`,
      url: paymentUrl,
    };
  }
  if (
    event.type === "payment_confirmed" &&
    (payment.status === "confirmed" || payment.status === "reversed") &&
    actorMatches(actor, payment.reviewedBy) &&
    exactTime(payment.reviewedAt)
  ) {
    return {
      recipients: from?.uid && from.uid !== actorUid ? [from] : [],
      preference: "payments",
      title: "Payment confirmed",
      body: `${to?.name ?? actor.name} confirmed your ${amount} payment`,
      url: paymentUrl,
    };
  }
  if (
    event.type === "payment_rejected" &&
    payment.status === "rejected" &&
    actorMatches(actor, payment.reviewedBy) &&
    exactTime(payment.reviewedAt)
  ) {
    return {
      recipients: from?.uid && from.uid !== actorUid ? [from] : [],
      preference: "payments",
      title: "Payment needs correction",
      body: payment.rejectionReason ?? `${actor.name} rejected the payment`,
      url: paymentUrl,
    };
  }
  if (
    event.type === "payment_cancelled" &&
    payment.status === "cancelled" &&
    actorMatches(actor, payment.cancelledBy) &&
    exactTime(payment.cancelledAt)
  ) {
    return {
      recipients: to?.uid && to.uid !== actorUid ? [to] : [],
      preference: "payments",
      title: "Payment cancelled",
      body: `${from?.name ?? actor.name} cancelled a ${amount} payment`,
      url: paymentUrl,
    };
  }
  if (
    event.type === "payment_reversed" &&
    payment.status === "reversed" &&
    actorMatches(actor, payment.reversedBy) &&
    exactTime(payment.reversedAt)
  ) {
    return {
      recipients: from?.uid && from.uid !== actorUid ? [from] : [],
      preference: "payments",
      title: "Payment reversed",
      body: payment.reversalReason ?? `${actor.name} reversed a ${amount} payment`,
      url: paymentUrl,
    };
  }
  throw new Error("Payment event does not match the saved group");
}

async function loadGroup(env, groupId, firebaseIdToken) {
  const response = await firestoreFetch(
    env,
    `groups/${encodeURIComponent(groupId)}`,
    firebaseIdToken,
  );
  if (!response.ok) throw new Error("Group not found");
  const document = decodeDocument(await response.json());
  if (document.deleted || typeof document.data !== "string") {
    throw new Error("Group not found");
  }
  return JSON.parse(document.data);
}

function normalizePreferences(value) {
  return {
    payments: value?.payments !== false,
    expenses: value?.expenses !== false,
    chat: value?.chat !== false,
    memberActivity: value?.memberActivity === true,
    systemNotifications: value?.systemNotifications === true,
    mutedChatGroupIds: Array.isArray(value?.mutedChatGroupIds)
      ? value.mutedChatGroupIds
          .filter((item) => typeof item === "string")
          .slice(0, 100)
      : [],
  };
}

async function loadRecipient(env, uid) {
  const [preferencesValue, tokenList] = await Promise.all([
    env.PUSH_KV.get(`preferences:${uid}`, "json"),
    env.PUSH_KV.list({ prefix: `device:${uid}:`, limit: 100 }),
  ]);
  const tokenDocuments = (
    await Promise.all(
      tokenList.keys.map(async ({ name }) => ({
        name,
        ...(await env.PUSH_KV.get(name, "json")),
      })),
    )
  ).filter((item) => typeof item.token === "string");
  return {
    uid,
    preferences: normalizePreferences(preferencesValue),
    tokenDocuments,
  };
}

function acceptsNotification(recipient, groupId, preference) {
  const settings = recipient.preferences;
  if (settings.systemNotifications !== true) return false;
  if (settings[preference] === false) return false;
  return !(
    preference === "chat" &&
    (settings.mutedChatGroupIds ?? []).includes(groupId)
  );
}

async function sendFcm(env, accessToken, token, notification, tag) {
  return fetch(
    `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(
      env.FIREBASE_PROJECT_ID,
    )}/messages:send`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          token,
          data: {
            title: notification.title,
            body: notification.body,
            url: notification.url,
            tag,
          },
          webpush: { headers: { Urgency: "high" } },
        },
      }),
    },
  );
}

async function deliveryId(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function alreadyDelivered(env, id) {
  return (await env.PUSH_KV.get(`delivery:${id}`)) !== null;
}

async function markDelivered(env, id, eventKey) {
  await env.PUSH_KV.put(`delivery:${id}`, eventKey, {
    expirationTtl: 7 * 24 * 60 * 60,
  });
}

async function processEvent(env, group, event, actorUid) {
  const eventDate = Date.parse(event.occurredAt);
  if (
    !Number.isFinite(eventDate) ||
    eventDate > Date.now() + 5 * 60_000 ||
    eventDate < Date.now() - 24 * 60 * 60_000
  ) {
    throw new Error("Event timestamp is outside the delivery window");
  }
  const eventKey = `${group.id}:${event.type}:${event.entityId}:${event.occurredAt}`;
  const marker = await deliveryId(eventKey);
  if (await alreadyDelivered(env, marker)) return { duplicate: true, sent: 0 };

  const notification = validateAndBuild(group, event, actorUid);
  const recipients = await Promise.all(
    notification.recipients.map((member) => loadRecipient(env, member.uid)),
  );
  const accepted = recipients.filter((recipient) =>
    acceptsNotification(
      recipient,
      group.id,
      notification.preference,
    ),
  );
  const accessToken = await serviceAccessToken(env);
  let sent = 0;
  let transientFailure = false;
  for (const recipient of accepted) {
    for (const tokenDocument of recipient.tokenDocuments) {
      if (typeof tokenDocument.token !== "string") continue;
      const response = await sendFcm(
        env,
        accessToken,
        tokenDocument.token,
        notification,
        marker,
      );
      if (response.ok) {
        sent += 1;
        continue;
      }
      const errorText = await response.text();
      if (
        response.status === 404 ||
        errorText.includes("UNREGISTERED") ||
        errorText.includes("INVALID_ARGUMENT")
      ) {
        await env.PUSH_KV.delete(tokenDocument.name);
      } else {
        transientFailure = true;
      }
    }
  }
  if (transientFailure) {
    throw new Error("FCM temporarily rejected one or more deliveries");
  }
  await markDelivered(env, marker, eventKey);
  return { duplicate: false, sent };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin") ?? "";
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  return allowed.includes(origin)
    ? {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "POST, PUT, DELETE, OPTIONS",
        Vary: "Origin",
      }
    : {};
}

function validTokenId(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

async function registerDevice(env, actorUid, body) {
  if (
    !validTokenId(body?.tokenId) ||
    typeof body?.token !== "string" ||
    body.token.length < 20 ||
    body.token.length > 4096
  ) {
    throw new Error("Invalid push device");
  }
  await Promise.all([
    env.PUSH_KV.put(
      `device:${actorUid}:${body.tokenId}`,
      JSON.stringify({
        token: body.token,
        platform:
          typeof body.platform === "string" ? body.platform.slice(0, 100) : "web",
        userAgent:
          typeof body.userAgent === "string"
            ? body.userAgent.slice(0, 500)
            : "",
        updatedAt: new Date().toISOString(),
      }),
    ),
    env.PUSH_KV.put(
      `preferences:${actorUid}`,
      JSON.stringify(normalizePreferences(body.preferences)),
    ),
  ]);
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }
    const url = new URL(request.url);
    if (request.method === "GET" && url.pathname === "/health") {
      return json({ ok: true }, 200, cors);
    }
    if (!cors["Access-Control-Allow-Origin"]) {
      return json({ error: "Origin is not allowed" }, 403, cors);
    }

    try {
      const authorization = request.headers.get("authorization") ?? "";
      if (!authorization.startsWith("Bearer ")) {
        return json({ error: "Authentication required" }, 401, cors);
      }
      const actor = await verifyFirebaseIdToken(
        authorization.slice(7),
        env.FIREBASE_PROJECT_ID,
      );

      if (request.method === "POST" && url.pathname === "/devices") {
        await registerDevice(env, actor.sub, await request.json());
        return json({ ok: true }, 200, cors);
      }
      if (
        request.method === "DELETE" &&
        url.pathname.startsWith("/devices/")
      ) {
        const tokenId = decodeURIComponent(url.pathname.slice("/devices/".length));
        if (!validTokenId(tokenId)) {
          return json({ error: "Invalid push device" }, 400, cors);
        }
        await env.PUSH_KV.delete(`device:${actor.sub}:${tokenId}`);
        return json({ ok: true }, 200, cors);
      }
      if (request.method === "PUT" && url.pathname === "/preferences") {
        const body = await request.json();
        await env.PUSH_KV.put(
          `preferences:${actor.sub}`,
          JSON.stringify(normalizePreferences(body.preferences)),
        );
        return json({ ok: true }, 200, cors);
      }
      if (request.method !== "POST" || url.pathname !== "/send") {
        return json({ error: "Not found" }, 404, cors);
      }

      const body = await request.json();
      if (
        typeof body.groupId !== "string" ||
        body.groupId.length === 0 ||
        body.groupId.length > 200 ||
        !Array.isArray(body.events) ||
        body.events.length === 0 ||
        body.events.length > 20
      ) {
        return json({ error: "Invalid push request" }, 400, cors);
      }
      const firebaseIdToken = authorization.slice(7);
      const group = await loadGroup(env, body.groupId, firebaseIdToken);
      const results = [];
      for (const event of body.events) {
        if (
          typeof event?.type !== "string" ||
          typeof event?.entityId !== "string" ||
          typeof event?.occurredAt !== "string" ||
          event.type.length > 50 ||
          event.entityId.length === 0 ||
          event.entityId.length > 200 ||
          event.occurredAt.length > 50
        ) {
          throw new Error("Invalid event");
        }
        results.push(await processEvent(env, group, event, actor.sub));
      }
      return json({ ok: true, results }, 200, cors);
    } catch (error) {
      console.error(error);
      return json(
        { error: error instanceof Error ? error.message : "Push failed" },
        400,
        cors,
      );
    }
  },
};
