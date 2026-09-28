const encoder = new TextEncoder();
let cachedAccessToken;

const DEFAULT_PREFERENCES = {
  emailEnabled: true,
  inAppEnabled: true,
  frequency: "weekly",
  weekday: 5,
  hour: 9,
  timeZone: "Asia/Manila",
  mutedGroupIds: [],
  groupSnoozes: {},
};

function htmlEscape(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function base64Url(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemBytes(pem) {
  const body = pem
    .replace(/\\n/g, "\n")
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s/g, "");
  return Uint8Array.from(atob(body), (character) => character.charCodeAt(0));
}

async function serviceAccessToken(env) {
  if (cachedAccessToken?.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.value;
  }
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(encoder.encode(JSON.stringify({ alg: "RS256", typ: "JWT" })));
  const claims = base64Url(encoder.encode(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: "https://www.googleapis.com/auth/datastore",
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  })));
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${header}.${claims}`),
  );
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error("Unable to authorize the reminder worker");
  const result = await response.json();
  cachedAccessToken = {
    value: result.access_token,
    expiresAt: Date.now() + Number(result.expires_in ?? 3600) * 1000,
  };
  return cachedAccessToken.value;
}

function decodeValue(value) {
  if (!value) return undefined;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, item]) => [key, decodeValue(item)]),
    );
  }
  return undefined;
}

function encodeValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (typeof value === "number") {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return {
    mapValue: {
      fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])),
    },
  };
}

function decodeDocument(document) {
  return Object.fromEntries(
    Object.entries(document.fields ?? {}).map(([key, value]) => [key, decodeValue(value)]),
  );
}

function firestoreRoot(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)`;
}

async function listCollection(env, collection, token) {
  const items = [];
  let pageToken = "";
  do {
    const url = new URL(`${firestoreRoot(env)}/documents/${collection}`);
    url.searchParams.set("pageSize", "100");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) throw new Error(`Unable to list ${collection}: ${response.status}`);
    const body = await response.json();
    for (const document of body.documents ?? []) {
      items.push({
        id: decodeURIComponent(document.name.split("/").at(-1)),
        name: document.name,
        ...decodeDocument(document),
      });
    }
    pageToken = body.nextPageToken ?? "";
  } while (pageToken);
  return items;
}

function preferences(value) {
  return {
    ...DEFAULT_PREFERENCES,
    ...(value && typeof value === "object" ? value : {}),
    mutedGroupIds: Array.isArray(value?.mutedGroupIds) ? value.mutedGroupIds : [],
    groupSnoozes: value?.groupSnoozes && typeof value.groupSnoozes === "object"
      ? value.groupSnoozes
      : {},
  };
}

function localDateParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (type) => parts.find((part) => part.type === type)?.value;
  return {
    weekday: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(get("weekday")),
    day: Number(get("day")),
    hour: Number(get("hour")),
    dateKey: `${get("year")}-${get("month")}-${get("day")}`,
  };
}

export function reminderIsDue(user, now = new Date()) {
  const settings = preferences(user.paymentReminderPreferences);
  if (!settings.emailEnabled && !settings.inAppEnabled) return false;
  let local;
  try {
    local = localDateParts(now, settings.timeZone || "Asia/Manila");
  } catch {
    local = localDateParts(now, "Asia/Manila");
  }
  if (local.hour !== settings.hour) return false;
  if (["weekly", "biweekly"].includes(settings.frequency) && local.weekday !== settings.weekday) {
    return false;
  }
  if (settings.frequency === "monthly" && local.day !== 1) return false;
  const previous = Date.parse(user.lastPaymentReminderAt ?? "");
  if (!Number.isFinite(previous)) return true;
  const elapsedDays = (now.getTime() - previous) / 86_400_000;
  const requiredDays = {
    every3days: 2.9,
    weekly: 6.9,
    biweekly: 13.9,
    monthly: 27,
  }[settings.frequency] ?? 6.9;
  return elapsedDays >= requiredDays;
}

export function hasReminderEmail(user) {
  return typeof user.email === "string" && user.email.trim().length > 0;
}

function projectedBalance(group, memberId) {
  const balances = {};
  for (const member of [...(group.members ?? []), ...(group.formerMembers ?? [])]) {
    balances[member.id] = 0;
  }
  for (const expense of group.expenses ?? []) {
    const payerId = expense.paidBy;
    const reserved = (expense.splits ?? []).reduce(
      (sum, split) =>
        split.memberId !== payerId && ["pending", "confirmed"].includes(split.paymentStatus)
          ? sum + Number(split.amount || 0)
          : sum,
      0,
    );
    balances[payerId] = (balances[payerId] ?? 0) + Number(expense.amount || 0) - reserved;
    for (const split of expense.splits ?? []) {
      if (
        split.memberId !== payerId &&
        ["pending", "confirmed"].includes(split.paymentStatus)
      ) continue;
      balances[split.memberId] = (balances[split.memberId] ?? 0) - Number(split.amount || 0);
    }
  }
  for (const payment of group.payments ?? []) {
    if (!["pending", "confirmed"].includes(payment.status)) continue;
    balances[payment.fromMemberId] =
      (balances[payment.fromMemberId] ?? 0) + Number(payment.amount || 0);
    balances[payment.toMemberId] =
      (balances[payment.toMemberId] ?? 0) - Number(payment.amount || 0);
  }
  return balances[memberId] ?? 0;
}

function oldestOutstandingAgeDays(group, memberId, now) {
  const timestamps = (group.expenses ?? [])
    .filter((expense) =>
      (expense.splits ?? []).some(
        (split) =>
          split.memberId === memberId &&
          split.memberId !== expense.paidBy &&
          Number(split.amount || 0) > 0.005 &&
          !["pending", "confirmed"].includes(split.paymentStatus),
      ),
    )
    .map((expense) => Date.parse(expense.createdAt ?? `${expense.date}T00:00:00Z`))
    .filter(Number.isFinite);
  if (timestamps.length === 0) return Infinity;
  return (now.getTime() - Math.min(...timestamps)) / 86_400_000;
}

export function buildUserSummary(user, groups, now = new Date()) {
  const settings = preferences(user.paymentReminderPreferences);
  const muted = new Set(settings.mutedGroupIds);
  return groups.flatMap((group) => {
    if (muted.has(group.id)) return [];
    const snoozedUntil = Date.parse(settings.groupSnoozes[group.id] ?? "");
    if (Number.isFinite(snoozedUntil) && snoozedUntil > now.getTime()) return [];
    const member = (group.members ?? []).find(
      (candidate) => candidate.uid === user.id || candidate.id === user.id,
    );
    if (!member) return [];
    const net = projectedBalance(group, member.id);
    if (net >= -0.005 || oldestOutstandingAgeDays(group, member.id, now) < 3) return [];
    const pendingPaymentAmount = (group.payments ?? [])
      .filter((payment) => payment.fromMemberId === member.id && payment.status === "pending")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return [{
      groupId: group.id,
      groupName: group.name,
      amount: Math.round(-net * 100) / 100,
      currency: group.currency || "PHP",
      pendingPaymentAmount: Math.round(pendingPaymentAmount * 100) / 100,
    }];
  });
}

function money(amount, currency) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amount);
}

function totalsByCurrency(groups) {
  const totals = {};
  for (const group of groups) totals[group.currency] = (totals[group.currency] ?? 0) + group.amount;
  return totals;
}

async function unsubscribeSignature(env, uid) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(env.REMINDER_SIGNING_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return base64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(uid))));
}

async function buildEmail(env, user, summaries, digestId) {
  const appUrl = env.APP_URL.replace(/\/$/, "");
  const totals = totalsByCurrency(summaries);
  const totalText = Object.entries(totals).map(([currency, amount]) => money(amount, currency)).join(" + ");
  const rows = summaries.map((summary) => `
    <tr><td style="padding:14px 0;border-bottom:1px solid #eee">
      <div style="font-weight:700;color:#17151f">${htmlEscape(summary.groupName)}</div>
      <div style="margin-top:4px;color:#686576">${htmlEscape(money(summary.amount, summary.currency))} left to settle${summary.pendingPaymentAmount > 0 ? ` · ${htmlEscape(money(summary.pendingPaymentAmount, summary.currency))} awaiting confirmation` : ""}</div>
      <div style="margin-top:6px;font-size:13px;color:#686576">Settle in full or make a partial payment—kung ano ang works for you.</div>
      <a href="${appUrl}/?openGroup=${encodeURIComponent(summary.groupId)}&tab=settle" style="display:inline-block;margin-top:10px;color:#5b46f5;font-weight:700;text-decoration:none">Review &amp; pay →</a>
    </td></tr>`).join("");
  const signature = await unsubscribeSignature(env, user.id);
  const unsubscribe = `${env.WORKER_PUBLIC_URL.replace(/\/$/, "")}/unsubscribe?uid=${encodeURIComponent(user.id)}&signature=${encodeURIComponent(signature)}`;
  const manage = `${appUrl}/?screen=profile&settings=notifications`;
  const subject = summaries.length === 1
    ? `${money(summaries[0].amount, summaries[0].currency)} left to settle in ${summaries[0].groupName}`
    : `Your payment summary: ${totalText} across ${summaries.length} groups`;
  return {
    from: env.EMAIL_FROM,
    to: [user.email],
    reply_to: env.EMAIL_REPLY_TO,
    subject,
    html: `<!doctype html><html><body style="margin:0;background:#f5f4fa;font-family:Arial,sans-serif;color:#17151f"><div style="display:none">A gentle BayadTayoOpo summary of balances that still need attention.</div><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 12px"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border-radius:22px;overflow:hidden"><tr><td style="padding:26px;background:#5b46f5;color:#fff"><img src="${appUrl}/icons/icon-192.png" width="42" height="42" alt="BayadTayoOpo" style="border-radius:12px;vertical-align:middle"><span style="margin-left:10px;font-size:20px;font-weight:800;vertical-align:middle">BayadTayoOpo</span></td></tr><tr><td style="padding:28px"><div style="font-size:13px;color:#7a758b">PAYMENT REMINDER</div><h1 style="font-size:26px;line-height:1.2;margin:8px 0 10px">May balances ka pang kailangang ayusin</h1><p style="margin:0;color:#686576;line-height:1.6">Hi ${htmlEscape(user.name || user.email.split("@")[0])}, here’s your gentle summary so nothing gets lost in the group chat.</p><div style="margin:22px 0;padding:18px;border-radius:16px;background:#f0edff"><div style="font-size:12px;color:#686576">TOTAL ACROSS ${summaries.length} ${summaries.length === 1 ? "GROUP" : "GROUPS"}</div><div style="margin-top:4px;font-size:24px;font-weight:800;color:#5b46f5">${htmlEscape(totalText)}</div></div><table width="100%" cellpadding="0" cellspacing="0">${rows}</table><a href="${appUrl}/" style="display:block;margin-top:24px;padding:14px;border-radius:14px;background:#5b46f5;color:#fff;font-weight:700;text-align:center;text-decoration:none">Open BayadTayoOpo</a><p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#888395">You’re receiving this because automatic payment reminders are enabled for your BayadTayoOpo account. <a href="${manage}" style="color:#5b46f5">Customize reminders</a> · <a href="${unsubscribe}" style="color:#5b46f5">Turn off email reminders</a></p></td></tr></table></td></tr></table></body></html>`,
    text: `BayadTayoOpo payment reminder\n\nSettle in full or make a partial payment—kung ano ang works for you.\n\n${summaries.map((item) => `${item.groupName}: ${money(item.amount, item.currency)} left to settle\nReview & pay: ${appUrl}/?openGroup=${encodeURIComponent(item.groupId)}&tab=settle`).join("\n\n")}\n\nCustomize reminders: ${manage}\nTurn off email reminders: ${unsubscribe}`,
    headers: { "X-Entity-Ref-ID": digestId },
  };
}

async function commitReminderUpdates(env, token, updates) {
  if (updates.length === 0) return;
  const writes = updates.map(({ user, digest, settings, emailSent }) => {
    const fields = {
      lastPaymentReminderAt: encodeValue(digest.createdAt),
      lastPaymentReminderKey: encodeValue(digest.id),
      paymentReminderDigest: encodeValue(settings.inAppEnabled ? digest : null),
    };
    const fieldPaths = ["lastPaymentReminderAt", "lastPaymentReminderKey", "paymentReminderDigest"];
    if (emailSent) {
      fields.lastPaymentReminderEmailAt = encodeValue(digest.createdAt);
      fieldPaths.push("lastPaymentReminderEmailAt");
    }
    return ({
    update: {
      name: `${firestoreRoot(env)}/documents/users/${encodeURIComponent(user.id)}`.replace("https://firestore.googleapis.com/v1/", ""),
      fields,
    },
    updateMask: { fieldPaths },
  });
  });
  const response = await fetch(`${firestoreRoot(env)}/documents:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes }),
  });
  if (!response.ok) throw new Error(`Unable to save reminder history: ${response.status}`);
}

async function runReminders(env, now = new Date()) {
  const token = await serviceAccessToken(env);
  const [users, groupDocuments] = await Promise.all([
    listCollection(env, "users", token),
    listCollection(env, "groups", token),
  ]);
  const groups = groupDocuments.flatMap((document) => {
    if (document.deleted || typeof document.data !== "string") return [];
    try { return [{ ...JSON.parse(document.data), id: document.id }]; } catch { return []; }
  });
  const dailyLimit = Math.min(100, Math.max(1, Number(env.MAX_EMAILS_PER_DAY ?? 95)));
  const utcDate = now.toISOString().slice(0, 10);
  const sentToday = users.filter((user) =>
    String(user.lastPaymentReminderEmailAt ?? "").startsWith(utcDate),
  ).length;
  let remainingEmailCapacity = Math.max(0, dailyLimit - sentToday);
  const due = users
    .filter((user) => reminderIsDue(user, now))
    .map((user) => ({ user, settings: preferences(user.paymentReminderPreferences), summaries: buildUserSummary(user, groups, now) }))
    .filter((item) => item.summaries.length > 0);
  const updates = [];
  const emails = [];
  for (const item of due) {
    const local = localDateParts(now, item.settings.timeZone || "Asia/Manila");
    const digest = {
      id: `payment-reminder:${item.user.id}:${local.dateKey}`,
      createdAt: now.toISOString(),
      groups: item.summaries,
    };
    const emailSent = hasReminderEmail(item.user)
      && item.settings.emailEnabled
      && remainingEmailCapacity > 0;
    updates.push({ user: item.user, digest, settings: item.settings, emailSent });
    if (emailSent) {
      emails.push(await buildEmail(env, item.user, item.summaries, digest.id));
      remainingEmailCapacity -= 1;
    }
  }
  if (emails.length > 0) {
    const response = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `payment-reminders/${now.toISOString().slice(0, 13)}`,
      },
      body: JSON.stringify(emails),
    });
    if (!response.ok) throw new Error(`Resend rejected reminder batch: ${response.status} ${await response.text()}`);
  }
  await commitReminderUpdates(env, token, updates);
  return { usersScanned: users.length, groupsScanned: groups.length, remindersCreated: updates.length, emailsSent: emails.length, emailQuotaRemaining: remainingEmailCapacity };
}

async function unsubscribe(request, env) {
  const url = new URL(request.url);
  const uid = url.searchParams.get("uid") ?? "";
  const signature = url.searchParams.get("signature") ?? "";
  if (!uid || signature !== await unsubscribeSignature(env, uid)) {
    return new Response("Invalid unsubscribe link", { status: 400 });
  }
  const token = await serviceAccessToken(env);
  const users = await listCollection(env, "users", token);
  const user = users.find((item) => item.id === uid);
  if (!user) return new Response("Account not found", { status: 404 });
  const settings = { ...preferences(user.paymentReminderPreferences), emailEnabled: false };
  const name = `${firestoreRoot(env)}/documents/users/${encodeURIComponent(uid)}`.replace("https://firestore.googleapis.com/v1/", "");
  const response = await fetch(`${firestoreRoot(env)}/documents:commit`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ writes: [{ update: { name, fields: { paymentReminderPreferences: encodeValue(settings) } }, updateMask: { fieldPaths: ["paymentReminderPreferences"] } }] }),
  });
  if (!response.ok) return new Response("Unable to update reminders", { status: 502 });
  return new Response(`<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f5f4fa;padding:40px"><main style="max-width:480px;margin:auto;background:#fff;padding:32px;border-radius:20px"><h1 style="color:#5b46f5">Email reminders are off</h1><p>You won’t receive automatic BayadTayoOpo payment emails. In-app reminders are unchanged.</p><a href="${env.APP_URL}/?screen=profile&settings=notifications">Manage notification settings</a></main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/unsubscribe") return unsubscribe(request, env);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "bayadtayoopo-reminders" });
    if (url.pathname === "/run" && request.method === "POST") {
      if (request.headers.get("authorization") !== `Bearer ${env.RUN_SECRET}`) return new Response("Unauthorized", { status: 401 });
      return Response.json(await runReminders(env));
    }
    return new Response("Not found", { status: 404 });
  },
};
