import { createRemoteJWKSet, jwtVerify } from "jose";

const encoder = new TextEncoder();
let cachedAccessToken;
const firebaseJwks = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"),
);

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
        documentName: document.name,
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

function deadlineSummary(group, memberId, todayKey) {
  const allocated = {};
  for (const payment of group.payments ?? []) {
    if (payment.fromMemberId !== memberId || !["pending", "confirmed"].includes(payment.status)) continue;
    for (const item of payment.allocations ?? []) {
      if (item.expenseId) allocated[item.expenseId] = (allocated[item.expenseId] ?? 0) + Number(item.amount || 0);
    }
  }
  for (const offset of group.balanceOffsets ?? []) {
    if (!["pending", "confirmed"].includes(offset.status)) continue;
    const items = offset.requesterMemberId === memberId
      ? offset.debitAllocations
      : offset.counterpartyMemberId === memberId
        ? offset.creditAllocations
        : [];
    for (const item of items ?? []) {
      if (item.expenseId) allocated[item.expenseId] = (allocated[item.expenseId] ?? 0) + Number(item.amount || 0);
    }
  }
  const result = { nearestDueDate: undefined, overdueAmount: 0, dueTodayAmount: 0, dueSoonAmount: 0 };
  const today = Date.parse(`${todayKey}T00:00:00Z`);
  for (const expense of group.expenses ?? []) {
    if (!expense.dueDate || expense.paidBy === memberId) continue;
    const split = (expense.splits ?? []).find((item) => item.memberId === memberId);
    if (!split || ["pending", "confirmed"].includes(split.paymentStatus)) continue;
    const remaining = Math.max(0, Number(split.amount || 0) - Number(allocated[expense.id] ?? 0));
    if (remaining <= 0.005) continue;
    const days = Math.round((Date.parse(`${expense.dueDate}T00:00:00Z`) - today) / 86_400_000);
    if (days < 0) result.overdueAmount += remaining;
    else if (days === 0) result.dueTodayAmount += remaining;
    else if (days <= 3) result.dueSoonAmount += remaining;
    if (!result.nearestDueDate || expense.dueDate < result.nearestDueDate) result.nearestDueDate = expense.dueDate;
  }
  return result;
}

function scheduleOccursOn(schedule, todayKey) {
  if (schedule.status !== "active" || !/^\d{4}-\d{2}-\d{2}$/.test(schedule.firstPaymentDate ?? "")) return false;
  const first = new Date(`${schedule.firstPaymentDate}T00:00:00Z`);
  const today = new Date(`${todayKey}T00:00:00Z`);
  if (today < first) return false;
  const days = Math.round((today.getTime() - first.getTime()) / 86_400_000);
  if (schedule.frequency === "weekly") return days % 7 === 0;
  if (schedule.frequency === "biweekly") return days % 14 === 0;
  if (schedule.frequency !== "monthly") return false;
  const targetDay = first.getUTCDate();
  const lastDay = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0)).getUTCDate();
  return today.getUTCDate() === Math.min(targetDay, lastDay);
}

function allocatedForMember(group, memberId) {
  const allocated = {};
  for (const payment of group.payments ?? []) {
    if (payment.fromMemberId !== memberId || !["pending", "confirmed"].includes(payment.status)) continue;
    for (const item of payment.allocations ?? []) {
      if (item.expenseId) allocated[item.expenseId] = (allocated[item.expenseId] ?? 0) + Number(item.amount || 0);
    }
  }
  for (const offset of group.balanceOffsets ?? []) {
    if (!["pending", "confirmed"].includes(offset.status)) continue;
    const items = offset.requesterMemberId === memberId
      ? offset.debitAllocations
      : offset.counterpartyMemberId === memberId
        ? offset.creditAllocations
        : [];
    for (const item of items ?? []) {
      if (item.expenseId) allocated[item.expenseId] = (allocated[item.expenseId] ?? 0) + Number(item.amount || 0);
    }
  }
  return allocated;
}

function scheduleSummary(group, memberId, todayKey) {
  const allocated = allocatedForMember(group, memberId);
  const due = [];
  for (const schedule of group.paymentSchedules ?? []) {
    if (schedule.debtorMemberId !== memberId || !scheduleOccursOn(schedule, todayKey)) continue;
    let remaining = 0;
    for (const item of schedule.coverage ?? []) {
      const expense = (group.expenses ?? []).find((candidate) => candidate.id === item.expenseId);
      const split = expense?.splits?.find((candidate) => candidate.memberId === memberId);
      if (!expense || !split || ["pending", "confirmed"].includes(split.paymentStatus)) continue;
      remaining += Math.max(0, Math.min(Number(item.amount || 0), Number(split.amount || 0)) - Number(allocated[item.expenseId] ?? 0));
    }
    if (remaining <= 0.005) continue;
    due.push({
      id: schedule.id,
      amount: Math.min(remaining, Number(schedule.installmentAmount || 0)),
      names: (schedule.coverage ?? []).map((item) => item.expenseDescription).filter(Boolean),
    });
  }
  return {
    amount: due.reduce((sum, item) => sum + item.amount, 0),
    count: due.length,
    names: [...new Set(due.flatMap((item) => item.names))].slice(0, 3),
    key: due.length > 0 ? `${group.id}:${todayKey}:${due.map((item) => item.id).sort().join(",")}` : undefined,
  };
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
    let local;
    try { local = localDateParts(now, settings.timeZone || "Asia/Manila"); }
    catch { local = localDateParts(now, "Asia/Manila"); }
    const deadlines = deadlineSummary(group, member.id, local.dateKey);
    const scheduled = scheduleSummary(group, member.id, local.dateKey);
    const hasDeadlineAttention = deadlines.overdueAmount > 0 || deadlines.dueTodayAmount > 0 || deadlines.dueSoonAmount > 0;
    if (net >= -0.005 || (!hasDeadlineAttention && scheduled.count === 0 && oldestOutstandingAgeDays(group, member.id, now) < 3)) return [];
    const pendingPaymentAmount = (group.payments ?? [])
      .filter((payment) => payment.fromMemberId === member.id && payment.status === "pending")
      .reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    return [{
      groupId: group.id,
      groupName: group.name,
      amount: Math.round(-net * 100) / 100,
      currency: group.currency || "PHP",
      pendingPaymentAmount: Math.round(pendingPaymentAmount * 100) / 100,
      ...(deadlines.nearestDueDate ? { nearestDueDate: deadlines.nearestDueDate } : {}),
      ...(deadlines.overdueAmount > 0 ? { overdueAmount: Math.round(deadlines.overdueAmount * 100) / 100 } : {}),
      ...(deadlines.dueTodayAmount > 0 ? { dueTodayAmount: Math.round(deadlines.dueTodayAmount * 100) / 100 } : {}),
      ...(deadlines.dueSoonAmount > 0 ? { dueSoonAmount: Math.round(deadlines.dueSoonAmount * 100) / 100 } : {}),
      ...(scheduled.count > 0 ? {
        scheduledPaymentAmount: Math.round(scheduled.amount * 100) / 100,
        scheduledPaymentCount: scheduled.count,
        scheduledExpenseNames: scheduled.names,
        scheduleReminderKey: scheduled.key,
      } : {}),
    }];
  });
}

export function deadlineReminderKey(summaries) {
  const parts = summaries.flatMap((summary) => {
    if (summary.scheduleReminderKey) return [`schedule:${summary.scheduleReminderKey}`];
    if (summary.overdueAmount > 0) return [`${summary.groupId}:overdue:${summary.nearestDueDate}`];
    if (summary.dueTodayAmount > 0) return [`${summary.groupId}:today:${summary.nearestDueDate}`];
    if (summary.dueSoonAmount > 0) return [`${summary.groupId}:soon:${summary.nearestDueDate}`];
    return [];
  });
  return parts.length > 0 ? parts.sort().join("|") : undefined;
}

function money(amount, currency) {
  return new Intl.NumberFormat("en-PH", { style: "currency", currency }).format(amount);
}

function totalsByCurrency(groups) {
  const totals = {};
  for (const group of groups) totals[group.currency] = (totals[group.currency] ?? 0) + group.amount;
  return totals;
}

export function userDisplayName(user) {
  const name = typeof user.name === "string" ? user.name.trim() : "";
  if (name && !name.startsWith("projects/")) return name;
  const email = typeof user.email === "string" ? user.email.trim() : "";
  return email ? email.split("@")[0] : "there";
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
      ${summary.scheduledPaymentAmount > 0 ? `<div style="margin-top:8px;padding:10px;border-radius:10px;background:#f0edff;color:#4d38dc"><strong>${htmlEscape(money(summary.scheduledPaymentAmount, summary.currency))} suggested today</strong>${summary.scheduledPaymentCount > 1 ? ` across ${summary.scheduledPaymentCount} schedules` : ""}${summary.scheduledExpenseNames?.length ? `<div style="margin-top:3px;font-size:12px">${htmlEscape(summary.scheduledExpenseNames.join(", "))}</div>` : ""}</div>` : ""}
      ${summary.overdueAmount > 0 ? `<div style="margin-top:6px;font-weight:700;color:#c73535">${htmlEscape(money(summary.overdueAmount, summary.currency))} overdue</div>` : summary.dueTodayAmount > 0 ? `<div style="margin-top:6px;font-weight:700;color:#a65b00">${htmlEscape(money(summary.dueTodayAmount, summary.currency))} due today</div>` : summary.dueSoonAmount > 0 ? `<div style="margin-top:6px;font-weight:700;color:#a65b00">${htmlEscape(money(summary.dueSoonAmount, summary.currency))} due within 3 days</div>` : ""}
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
    html: `<!doctype html><html><body style="margin:0;background:#f5f4fa;font-family:Arial,sans-serif;color:#17151f"><div style="display:none">A gentle BayadTayoOpo summary of balances that still need attention.</div><table width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:28px 12px"><table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#fff;border-radius:22px;overflow:hidden"><tr><td style="padding:26px;background:#5b46f5;color:#fff"><img src="${appUrl}/icons/icon-192.png" width="42" height="42" alt="BayadTayoOpo" style="border-radius:12px;vertical-align:middle"><span style="margin-left:10px;font-size:20px;font-weight:800;vertical-align:middle">BayadTayoOpo</span></td></tr><tr><td style="padding:28px"><div style="font-size:13px;color:#7a758b">PAYMENT REMINDER</div><h1 style="font-size:26px;line-height:1.2;margin:8px 0 10px">May balances ka pang kailangang ayusin</h1><p style="margin:0;color:#686576;line-height:1.6">Hi ${htmlEscape(userDisplayName(user))}, here’s your gentle summary so nothing gets lost in the group chat.</p><div style="margin:22px 0;padding:18px;border-radius:16px;background:#f0edff"><div style="font-size:12px;color:#686576">TOTAL ACROSS ${summaries.length} ${summaries.length === 1 ? "GROUP" : "GROUPS"}</div><div style="margin-top:4px;font-size:24px;font-weight:800;color:#5b46f5">${htmlEscape(totalText)}</div></div><table width="100%" cellpadding="0" cellspacing="0">${rows}</table><a href="${appUrl}/" style="display:block;margin-top:24px;padding:14px;border-radius:14px;background:#5b46f5;color:#fff;font-weight:700;text-align:center;text-decoration:none">Open BayadTayoOpo</a><p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#888395">You’re receiving this because automatic payment reminders are enabled for your BayadTayoOpo account. <a href="${manage}" style="color:#5b46f5">Customize reminders</a> · <a href="${unsubscribe}" style="color:#5b46f5">Turn off email reminders</a></p></td></tr></table></td></tr></table></body></html>`,
    text: `BayadTayoOpo payment reminder\n\nSettle in full or make a partial payment—kung ano ang works for you.\n\n${summaries.map((item) => `${item.groupName}: ${money(item.amount, item.currency)} left to settle${item.scheduledPaymentAmount > 0 ? `\n${money(item.scheduledPaymentAmount, item.currency)} suggested today${item.scheduledExpenseNames?.length ? ` for ${item.scheduledExpenseNames.join(", ")}` : ""}` : ""}${item.overdueAmount > 0 ? `\n${money(item.overdueAmount, item.currency)} overdue` : item.dueTodayAmount > 0 ? `\n${money(item.dueTodayAmount, item.currency)} due today` : item.dueSoonAmount > 0 ? `\n${money(item.dueSoonAmount, item.currency)} due within 3 days` : ""}\nReview & pay: ${appUrl}/?openGroup=${encodeURIComponent(item.groupId)}&tab=settle`).join("\n\n")}\n\nCustomize reminders: ${manage}\nTurn off email reminders: ${unsubscribe}`,
    headers: { "X-Entity-Ref-ID": digestId },
  };
}

async function commitReminderUpdates(env, token, updates) {
  if (updates.length === 0) return;
  const writes = updates.map(({ user, digest, settings, emailSent, deadlineKey }) => {
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
    if (deadlineKey) {
      fields.lastDeadlineReminderKey = encodeValue(deadlineKey);
      fieldPaths.push("lastDeadlineReminderKey");
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

export function buildPublicStats(users, groups, now = new Date()) {
  return {
    userCount: users.length,
    groupCount: groups.length,
    expenseCount: groups.reduce(
      (count, group) => count + (Array.isArray(group.expenses) ? group.expenses.length : 0),
      0,
    ),
    updatedAt: now.toISOString(),
  };
}

const PUBLIC_STATS_DOCUMENT = "system/publicStats";

async function savePublicStatsSnapshot(env, token, stats) {
  const response = await fetch(
    `${firestoreRoot(env)}/documents/${PUBLIC_STATS_DOCUMENT}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        fields: Object.fromEntries(
          Object.entries(stats).map(([key, value]) => [key, encodeValue(value)]),
        ),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(`Unable to save public stats: ${response.status}`);
  }
}

async function loadPublicStatsSnapshot(env, token) {
  const response = await fetch(
    `${firestoreRoot(env)}/documents/${PUBLIC_STATS_DOCUMENT}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );
  if (!response.ok) {
    throw new Error(`Unable to load public stats snapshot: ${response.status}`);
  }
  return decodeDocument(await response.json());
}

async function refreshPublicStats(env, now = new Date()) {
  const token = await serviceAccessToken(env);
  const [users, groupDocuments] = await Promise.all([
    listCollection(env, "users", token),
    listCollection(env, "groups", token),
  ]);
  const groups = groupDocuments.flatMap((document) => {
    if (document.deleted || typeof document.data !== "string") return [];
    try {
      return [{ ...JSON.parse(document.data), id: document.id }];
    } catch {
      return [];
    }
  });
  const stats = buildPublicStats(users, groups, now);
  await savePublicStatsSnapshot(env, token, stats);
  return { stats, users, groups };
}

async function runReminders(env, now = new Date()) {
  const { users, groups } = await refreshPublicStats(env, now);
  const token = await serviceAccessToken(env);
  const dailyLimit = Math.min(100, Math.max(1, Number(env.MAX_EMAILS_PER_DAY ?? 95)));
  const utcDate = now.toISOString().slice(0, 10);
  const sentToday = users.filter((user) =>
    String(user.lastPaymentReminderEmailAt ?? "").startsWith(utcDate),
  ).length;
  let remainingEmailCapacity = Math.max(0, dailyLimit - sentToday);
  const due = users
    .map((user) => {
      const settings = preferences(user.paymentReminderPreferences);
      const summaries = buildUserSummary(user, groups, now);
      const deadlineKey = deadlineReminderKey(summaries);
      const deadlineIsDue =
        !!deadlineKey &&
        deadlineKey !== user.lastDeadlineReminderKey &&
        (settings.emailEnabled || settings.inAppEnabled);
      return {
        user,
        settings,
        summaries,
        deadlineKey: deadlineIsDue ? deadlineKey : undefined,
        isDue: reminderIsDue(user, now) || deadlineIsDue,
      };
    })
    .filter((item) => item.isDue && item.summaries.length > 0);
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
    updates.push({ user: item.user, digest, settings: item.settings, emailSent, deadlineKey: item.deadlineKey });
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

async function publicStatsResponse(request, env, ctx) {
  const url = new URL(request.url);
  const cacheKey = new Request(`${url.origin}/stats`, { method: "GET" });
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  try {
    const token = await serviceAccessToken(env);
    const stats = await loadPublicStatsSnapshot(env, token);
    const response = Response.json(stats, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
    ctx.waitUntil(cache.put(cacheKey, response.clone()));
    return response;
  } catch (error) {
    console.error("Unable to load public stats", error);
    return Response.json(
      { error: "Public statistics are temporarily unavailable" },
      {
        status: 502,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-store",
        },
      },
    );
  }
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

function supportCorsHeaders(request, env) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = new URL(env.APP_URL).origin;
  const developmentOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin || developmentOrigin
      ? origin
      : allowedOrigin,
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function supportJson(request, env, body, status = 200) {
  return Response.json(body, {
    status,
    headers: { ...supportCorsHeaders(request, env), "Cache-Control": "no-store" },
  });
}

async function verifiedSupportUser(request, env) {
  const authorization = request.headers.get("authorization") ?? "";
  if (!authorization.startsWith("Bearer ")) throw new Error("UNAUTHORIZED");
  const token = authorization.slice(7);
  const { payload } = await jwtVerify(token, firebaseJwks, {
    audience: env.FIREBASE_PROJECT_ID,
    issuer: `https://securetoken.google.com/${env.FIREBASE_PROJECT_ID}`,
  });
  if (!payload.sub || typeof payload.email !== "string") {
    throw new Error("UNAUTHORIZED");
  }
  return { uid: payload.sub, email: payload.email, name: payload.name };
}

function supportReference(now = new Date()) {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase();
  return `BTO-${date}-${random}`;
}

function cleanSupportText(value, maximum) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function supportScreenshot(value) {
  if (typeof value !== "string" || !value) return undefined;
  const match = value.match(/^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/=]+)$/);
  if (!match || match[2].length > 1_500_000) throw new Error("INVALID_SCREENSHOT");
  return {
    filename: `bayadtayoopo-report.${match[1] === "jpeg" ? "jpg" : match[1]}`,
    content: match[2],
  };
}

async function enforceSupportRateLimit(env, uid, now = new Date()) {
  const token = await serviceAccessToken(env);
  const documentUrl = `${firestoreRoot(env)}/documents/supportRateLimits/${encodeURIComponent(uid)}`;
  const response = await fetch(documentUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  let windowStart = now.toISOString();
  let count = 0;
  if (response.ok) {
    const existing = decodeDocument(await response.json());
    const previousStart = Date.parse(existing.windowStart ?? "");
    if (Number.isFinite(previousStart) && now.getTime() - previousStart < 3_600_000) {
      windowStart = existing.windowStart;
      count = Number(existing.count ?? 0);
    }
  } else if (response.status !== 404) {
    throw new Error("RATE_LIMIT_UNAVAILABLE");
  }
  if (count >= 3) throw new Error("RATE_LIMITED");
  return async () => {
    const url = new URL(documentUrl);
    url.searchParams.append("updateMask.fieldPaths", "windowStart");
    url.searchParams.append("updateMask.fieldPaths", "count");
    url.searchParams.append("updateMask.fieldPaths", "updatedAt");
    const update = await fetch(url, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ fields: {
        windowStart: encodeValue(windowStart),
        count: encodeValue(count + 1),
        updatedAt: encodeValue(now.toISOString()),
      } }),
    });
    if (!update.ok) throw new Error("RATE_LIMIT_SAVE_FAILED");
  };
}

async function submitSupportReport(request, env) {
  const origin = request.headers.get("origin") ?? "";
  const allowedOrigin = new URL(env.APP_URL).origin;
  if (origin && origin !== allowedOrigin && !/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) {
    return supportJson(request, env, { error: "Origin not allowed" }, 403);
  }

  let user;
  try {
    user = await verifiedSupportUser(request, env);
  } catch {
    return supportJson(request, env, { error: "Sign in again before sending your report." }, 401);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > 2_000_000) {
    return supportJson(request, env, { error: "The screenshot is too large." }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return supportJson(request, env, { error: "Invalid report." }, 400);
  }
  const type = body.type === "feedback" ? "feedback" : "bug";
  const subject = cleanSupportText(body.subject, 120);
  const description = cleanSupportText(body.description, 5000);
  if (!subject || description.length < 10) {
    return supportJson(request, env, { error: "Add a subject and a little more detail." }, 400);
  }

  let attachment;
  try {
    attachment = supportScreenshot(body.screenshotDataUrl);
  } catch {
    return supportJson(request, env, { error: "That screenshot is too large or unsupported." }, 400);
  }

  let recordRateLimit;
  try {
    recordRateLimit = await enforceSupportRateLimit(env, user.uid);
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      return supportJson(request, env, { error: "You’ve sent several reports recently. Please try again in an hour." }, 429);
    }
    return supportJson(request, env, { error: "Support is temporarily unavailable." }, 503);
  }

  const reference = supportReference();
  const context = body.context && typeof body.context === "object" ? body.context : {};
  const contextRows = [
    ["User ID", user.uid],
    ["Account email", user.email],
    ["App version", cleanSupportText(context.appVersion, 100) || "Unknown"],
    ["Page", cleanSupportText(context.page, 500) || "Unknown"],
    ["Device/browser", cleanSupportText(context.userAgent, 500) || "Unknown"],
    ["Group", cleanSupportText(context.groupName, 150) || "Not included"],
    ["Group ID", cleanSupportText(context.groupId, 150) || "Not included"],
    ["Reported at", new Date().toISOString()],
  ];
  const email = {
    from: env.EMAIL_FROM,
    to: [env.SUPPORT_EMAIL || env.EMAIL_REPLY_TO],
    reply_to: user.email,
    subject: `[${reference}] ${type === "bug" ? "Bug report" : "Feedback"}: ${subject}`,
    html: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#17151f"><div style="max-width:680px;margin:auto"><div style="padding:22px;border-radius:18px 18px 0 0;background:#5b46f5;color:white"><strong style="font-size:20px">BayadTayoOpo support</strong><div style="margin-top:6px">${htmlEscape(reference)}</div></div><div style="padding:24px;border:1px solid #e5e2ec;border-top:0;border-radius:0 0 18px 18px"><div style="font-size:12px;color:#686576;text-transform:uppercase">${htmlEscape(type)}</div><h1 style="font-size:22px">${htmlEscape(subject)}</h1><p style="white-space:pre-wrap;line-height:1.6">${htmlEscape(description)}</p><h2 style="margin-top:28px;font-size:16px">Technical context shared by the user</h2><table style="width:100%;border-collapse:collapse">${contextRows.map(([label, value]) => `<tr><td style="padding:8px;border-bottom:1px solid #eee;color:#686576">${htmlEscape(label)}</td><td style="padding:8px;border-bottom:1px solid #eee;word-break:break-word">${htmlEscape(value)}</td></tr>`).join("")}</table></div></div></body></html>`,
    text: `${reference}\n${type === "bug" ? "Bug report" : "Feedback"}: ${subject}\n\n${description}\n\n${contextRows.map(([label, value]) => `${label}: ${value}`).join("\n")}`,
    ...(attachment ? { attachments: [attachment] } : {}),
    headers: { "X-Entity-Ref-ID": reference },
  };
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `support/${reference}`,
    },
    body: JSON.stringify(email),
  });
  if (!response.ok) {
    console.error("Resend rejected support report", response.status, await response.text());
    return supportJson(request, env, { error: "We couldn’t send the report. Please try again." }, 502);
  }
  await recordRateLimit();
  return supportJson(request, env, { ok: true, reference });
}

export default {
  async scheduled(_controller, env, ctx) {
    ctx.waitUntil(runReminders(env));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/support-report" && request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: supportCorsHeaders(request, env) });
    }
    if (url.pathname === "/support-report" && request.method === "POST") {
      return submitSupportReport(request, env);
    }
    if (url.pathname === "/stats" && request.method === "GET") {
      return publicStatsResponse(request, env, ctx);
    }
    if (url.pathname === "/refresh-stats" && request.method === "POST") {
      if (request.headers.get("authorization") !== `Bearer ${env.RUN_SECRET}`) {
        return new Response("Unauthorized", { status: 401 });
      }
      const { stats } = await refreshPublicStats(env);
      const response = Response.json(stats, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "public, max-age=3600, s-maxage=3600",
        },
      });
      const cacheKey = new Request(`${url.origin}/stats`, { method: "GET" });
      ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
      return response;
    }
    if (url.pathname === "/unsubscribe") return unsubscribe(request, env);
    if (url.pathname === "/health") return Response.json({ ok: true, service: "bayadtayoopo-reminders" });
    if (url.pathname === "/run" && request.method === "POST") {
      if (request.headers.get("authorization") !== `Bearer ${env.RUN_SECRET}`) return new Response("Unauthorized", { status: 401 });
      return Response.json(await runReminders(env));
    }
    return new Response("Not found", { status: 404 });
  },
};
