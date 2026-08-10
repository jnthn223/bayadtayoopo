# BayadTayoOpo Push Notifications — Explain Like I’m 10

This guide explains how BayadTayoOpo sends browser notifications, including
when the installed PWA is closed. It also explains why each service exists,
what data it can access, how staging was configured, and how to repeat the
process safely for production.

## The 30-second story

Imagine a school:

- **BayadTayoOpo** is the classroom where group activity happens.
- **Firebase Authentication** is the school ID card.
- **Firestore** is the class record book.
- **Cloudflare Worker** is the trusted teacher checking whether an announcement
  is real.
- **Cloudflare KV** is the teacher's small address book of devices that asked
  for notifications.
- **Firebase Cloud Messaging (FCM)** is the delivery rider.
- **The service worker** is a tiny helper allowed to wake up at the user's
  device and display the delivered message.

When Bob submits a real payment, the teacher checks the record book, confirms
that Bob really submitted it, looks up the correct recipient's registered
devices, and asks the delivery rider to send the notification.

The web app never receives the secret delivery credential.

## Why ordinary browser notifications were not enough

There are three notification layers in this app:

| Layer | What it does | Works when app is closed? |
| --- | --- | --- |
| In-app inbox | Shows durable activity derived from group data | Visible after reopening |
| Live in-app alert | Shows a banner while BayadTayoOpo is open | No |
| Web Push | Wakes the service worker and shows an OS notification | Yes, when supported |

The Notifications API can display a message, but it cannot discover a new
Firestore payment while every BayadTayoOpo window is closed.

Web Push solves the wake-up part, but a trusted online sender is still needed.
Firebase Cloud Functions normally fills that role. Cloud Functions deployment
requires Firebase Blaze, so this project uses a Cloudflare Worker instead and
keeps Firebase on Spark.

## The cast of characters

### React app

The visible BayadTayoOpo interface:

- asks for notification permission only after the user taps a button;
- registers the browser with FCM;
- detects meaningful group changes caused by the signed-in user;
- sends only an event identity to the Worker.

It does **not** choose notification recipients or send arbitrary notification
text.

### Firebase Authentication

Firebase gives a signed-in user an ID token. Think of it as a short-lived,
digitally signed school ID.

The browser attaches that token to Worker requests:

```http
Authorization: Bearer <firebase-id-token>
```

The Worker verifies:

- Google's signature;
- the Firebase project ID;
- expiration time;
- the user's Firebase UID.

### Firestore

Firestore remains the source of truth for:

- groups and members;
- expenses and deleted-expense history;
- payments and their statuses;
- chat messages;
- notification inbox preferences and read cursor.

The Worker reads the relevant group using the initiating user's Firebase ID
token. Therefore, normal Firestore Security Rules are still applied.

The Worker's Google service account has **no Firestore role**.

### Cloudflare Worker

The Worker is the trusted checker and sender. It:

1. accepts requests only from the configured BayadTayoOpo origin;
2. verifies the Firebase ID token;
3. loads the saved group through Firestore Security Rules;
4. confirms that the claimed event exists;
5. confirms the signed-in user really performed it;
6. calculates recipients from the group;
7. checks each recipient's push preferences;
8. sends an FCM message;
9. records a short-lived duplicate marker.

### Cloudflare KV

KV is a small key-value address book. It stores:

```text
device:<firebase-uid>:<token-hash>
preferences:<firebase-uid>
delivery:<event-hash>
```

Device records contain an FCM device token and limited device information.
Preference records decide which system notifications the user wants.

Delivery markers expire after seven days. They reduce duplicate pushes if the
same event request is repeated.

### Firebase Cloud Messaging

FCM receives an authenticated request from the Worker and routes it to the
correct browser push service.

FCM itself is a no-cost Firebase product. The Worker uses a dedicated service
account with only:

```text
Firebase Cloud Messaging API Admin
```

It does not use an Owner credential or the Firebase Admin SDK account.

### Service worker

The service worker is [public/sw.js](../public/sw.js). It already handles:

- offline app-shell caching;
- PWA updates;
- background push events;
- notification clicks.

When a push arrives and no visible BayadTayoOpo window exists, it calls:

```js
self.registration.showNotification(...)
```

When the user taps the notification, it opens or focuses BayadTayoOpo using a
deep link such as:

```text
/?openGroup=trip-id&tab=settle&payment=payment-id
```

## Flow 1: enabling notifications

```text
User taps "Enable system alerts"
              |
              v
Browser asks for permission
              |
              v
Firebase Messaging registers the browser
              |
              v
FCM returns a device token
              |
              v
App hashes the token for a safe KV key name
              |
              v
POST /devices + Firebase ID token
              |
              v
Worker verifies the user
              |
              v
Worker stores device + preferences in KV
```

Important details:

- Permission is requested only following the user's click.
- The VAPID public key identifies the Firebase Web Push setup.
- The raw FCM token is not stored in Firestore.
- Turning system alerts off deletes that device from KV and unregisters it
  from Firebase Messaging.
- Each browser or installed PWA is a separate device registration.

## Flow 2: sending a notification

Suppose Bob sends a group chat message.

```text
Bob saves chat message to Firestore
              |
              v
App compares group before and after
              |
              v
App finds: chat_message, message ID, timestamp
              |
              v
POST /send + Bob's Firebase ID token
              |
              v
Worker verifies Bob's Firebase ID
              |
              v
Worker reads the group as Bob
              |
              v
Worker confirms that:
  - message exists
  - message belongs to Bob
  - timestamp exactly matches
              |
              v
Worker calculates all other joined members
              |
              v
Worker removes muted/disabled recipients
              |
              v
Worker sends each registered device through FCM
              |
              v
Browser wakes service worker
              |
              v
Notification appears
```

## Why the app sends an event identity instead of notification text

The browser sends something small:

```json
{
  "groupId": "trip-id",
  "events": [
    {
      "type": "chat_message",
      "entityId": "message-id",
      "occurredAt": "2026-07-28T01:00:00.000Z"
    }
  ]
}
```

It does not send:

```json
{
  "recipient": "any-user-I-want",
  "title": "Fake warning",
  "body": "Click this"
}
```

This matters because browser code can be inspected and modified. The Worker
must never trust the browser to choose recipients or invent notification text.

The Worker rebuilds the title, message, recipient list, and destination from
the saved group.

## Events currently supported

| Event | Who receives it |
| --- | --- |
| Payment submitted | The person receiving the payment |
| Payment confirmed | The payer |
| Payment rejected | The payer |
| Payment cancelled | The intended recipient |
| Payment reversed | The payer |
| Expense created | Other members included in that expense |
| Expense updated | Other members included in that expense |
| Expense deleted | Other joined group members |
| Chat message | Other joined members who have not muted the group |
| Member joined | Group admins who enabled member activity |

The sender never receives their own push.

## Preferences

Users can independently control:

- payments;
- expenses;
- group chat;
- member activity;
- system/closed-app notifications;
- muted chat groups.

Firestore stores preferences for the in-app inbox and cross-device account
sync. KV stores a copy used by the push sender.

The app updates KV when preferences change and refreshes the current device
registration when the app opens.

## Avoiding duplicate alerts

There are two duplicate protections:

1. Each logical event has a deterministic identity.
2. The Worker stores a hashed delivery marker in KV for seven days.

The service worker also avoids showing a system notification when a visible
BayadTayoOpo window already exists. The visible app uses its in-app banner
instead.

This is best-effort duplicate prevention, not a financial transaction system.
The group record in Firestore remains the source of truth.

## Security boundaries

### Public values

These are safe to include in the browser bundle:

- Firebase web configuration;
- VAPID public key;
- Cloudflare Worker URL;
- Firebase project ID;
- Firebase Hosting URL.

Public does not mean unprotected. Firebase Security Rules and Worker
authentication still protect operations.

### Secrets

These must never be committed or placed in a `VITE_` variable:

- service-account private key;
- server access tokens;
- private VAPID key.

The Worker stores:

```text
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
```

as encrypted Cloudflare secrets.

The private key belongs to a dedicated FCM-only service account. If it is ever
exposed:

1. disable or delete that Google service-account key;
2. create a replacement;
3. replace the Cloudflare secret;
4. review Worker and FCM activity.

### CORS is not authentication

CORS tells browsers which website may call the Worker. Attackers can imitate an
HTTP request outside a browser, so every private endpoint also verifies the
Firebase ID token.

### Worker endpoints

| Method and path | Purpose |
| --- | --- |
| `GET /health` | Public availability check |
| `POST /devices` | Register or refresh the current browser |
| `DELETE /devices/:tokenId` | Remove the current user's device |
| `PUT /preferences` | Update push filtering preferences |
| `POST /send` | Validate and deliver one or more real group events |

All endpoints except `/health` require a valid Firebase ID token. Mutation
endpoints also require an allowed origin.

## Where the code lives

Read these files in this order:

1. [types.ts](../src/app/components/types.ts)  
   Defines notifications and preference shapes.

2. [notifications.ts](../src/app/components/notifications.ts)  
   Builds the durable in-app notification inbox from group records.

3. [pushEvents.ts](../src/app/components/pushEvents.ts)  
   Compares the old and new group and finds events caused by the current user.

4. [pushNotifications.ts](../src/lib/pushNotifications.ts)  
   Requests permission, registers devices, synchronizes preferences, and calls
   the Worker.

5. [App.tsx](../src/app/App.tsx)  
   Connects saved group updates to event detection and push delivery.

6. [ProfileScreen.tsx](../src/app/components/ProfileScreen.tsx)  
   Contains the user-facing notification controls.

7. [public/sw.js](../public/sw.js)  
   Receives background pushes and handles notification clicks.

8. [Worker index.js](../workers/push/src/index.js)  
   Verifies users and events, selects recipients, and calls FCM.

9. [Worker configuration](../workers/push/wrangler.staging.toml)  
   Connects the Worker to the correct Firebase project, origin, and KV
   namespace.

10. [firestore.rules](../firestore.rules)  
    Protects the profile and group data used by the in-app notification system.

## Staging configuration

Current staging services:

| Service | Value |
| --- | --- |
| Firebase project | `bayadtayoopo-staging` |
| Web app | `https://bayadtayoopo-staging.web.app` |
| Worker | `https://bayadtayoopo-push-staging.bayadtayoopo.workers.dev` |
| Worker name | `bayadtayoopo-push-staging` |
| Service account | `bayadtayoopo-push-staging@bayadtayoopo-staging.iam.gserviceaccount.com` |

The ignored `.env.staging.local` contains:

```bash
VITE_FIREBASE_VAPID_KEY=<public-staging-vapid-key>
VITE_PUSH_API_URL=https://bayadtayoopo-push-staging.bayadtayoopo.workers.dev
```

The public key is allowed in the built JavaScript. The service-account private
key is not.

## Recreating the staging setup

These commands are reference material. Do not recreate resources that already
exist.

### 1. Enable required Google APIs

```bash
gcloud services enable fcm.googleapis.com \
  --project bayadtayoopo-staging

gcloud services enable fcmregistrations.googleapis.com \
  --project bayadtayoopo-staging
```

### 2. Create an FCM-only service account

```bash
gcloud iam service-accounts create bayadtayoopo-push-staging \
  --display-name="BayadTayoOpo Staging Push Sender" \
  --project bayadtayoopo-staging
```

Grant only the FCM sending role:

```bash
gcloud projects add-iam-policy-binding bayadtayoopo-staging \
  --member="serviceAccount:bayadtayoopo-push-staging@bayadtayoopo-staging.iam.gserviceaccount.com" \
  --role="roles/firebasecloudmessaging.admin" \
  --condition=None
```

Do not grant Owner, Editor, Firebase Admin, or Datastore User.

### 3. Generate the Firebase Web Push key

In Firebase Console:

1. Select the staging project.
2. Open Project settings.
3. Open Cloud Messaging.
4. Find Web configuration → Web Push certificates.
5. Generate a key pair.
6. Put only the displayed public key in `VITE_FIREBASE_VAPID_KEY`.

### 4. Create the Cloudflare KV namespace

```bash
cd workers/push
npm install
npx wrangler login
npx wrangler kv namespace create PUSH_KV \
  --config wrangler.staging.toml \
  --binding PUSH_KV
```

Copy the returned opaque namespace ID exactly into:

```toml
[[kv_namespaces]]
binding = "PUSH_KV"
id = "<staging-kv-namespace-id>"
```

### 5. Store the FCM credential

Create a temporary key for the dedicated service account:

```bash
gcloud iam service-accounts keys create /tmp/push-staging-key.json \
  --iam-account=bayadtayoopo-push-staging@bayadtayoopo-staging.iam.gserviceaccount.com \
  --project=bayadtayoopo-staging
```

Upload only to Cloudflare encrypted secrets:

```bash
jq -r '.client_email' /tmp/push-staging-key.json \
  | npx wrangler secret put FIREBASE_CLIENT_EMAIL \
      --config wrangler.staging.toml

jq -r '.private_key' /tmp/push-staging-key.json \
  | npx wrangler secret put FIREBASE_PRIVATE_KEY \
      --config wrangler.staging.toml
```

Delete the temporary local copy immediately:

```bash
rm /tmp/push-staging-key.json
```

Never paste the key into source code, `.env`, chat, an issue, or a commit.

### 6. Deploy staging

Worker:

```bash
cd workers/push
npm run deploy:staging
```

Web app and Firestore rules:

```bash
cd ../..
npm run deploy:staging
```

## Staging test plan

Use two real staging accounts that belong to the same test group.

### Registration test

1. Open staging as account A.
2. Go to Profile → Notifications.
3. Enable system alerts.
4. Accept the browser permission.
5. Save notification settings.

Expected result: `/devices` succeeds and a device entry appears in staging KV.

### Foreground test

1. Keep account A visible.
2. Account B sends a chat message.

Expected result: account A sees the in-app banner and inbox item, without a
duplicate OS notification.

### Background test

1. Put account A in another tab or background the installed PWA.
2. Account B sends another message.

Expected result: account A receives an OS notification.

### Closed-app test

1. Fully close account A's installed PWA.
2. Account B submits a payment or sends a message.

Expected result: the device displays a notification and tapping it opens the
correct group destination.

On iPhone/iPad, the site must be added to the Home Screen before Web Push can
be enabled. Request permission from the installed Home Screen app.

### Preference tests

- Mute one group's chat and confirm that its chat no longer produces pushes.
- Disable payments and confirm that payment pushes stop.
- Turn off system alerts and confirm the device is removed.
- Confirm the in-app inbox still follows its own saved preferences.

### Deep-link tests

Tap notifications for:

- chat;
- payment review;
- payment confirmation;
- expense.

Confirm the correct tab opens and the relevant record is highlighted.

## Troubleshooting

### “Push notifications have not been configured”

The built environment is missing:

```text
VITE_FIREBASE_VAPID_KEY
VITE_PUSH_API_URL
```

Rebuild after adding them. Vite embeds environment values at build time.

### Permission is blocked

The browser remembers a denial. Re-enable notifications in the browser or OS
site settings. Repeatedly calling `requestPermission()` cannot override a user
denial.

### iPhone does not offer notifications

Check:

- iOS/iPadOS supports Home Screen Web Push;
- the app was added to the Home Screen;
- it is opened from its Home Screen icon;
- permission was requested following a user tap.

### Worker returns `401`

The Firebase ID token is absent, expired, or from the wrong Firebase project.
Sign out and sign back in to staging.

### Worker returns `403`

The request origin does not match `ALLOWED_ORIGINS`. Confirm the staging Worker
allows only the staging Hosting URL and production allows only production URLs.

### Worker says the event does not match

The saved group did not contain the exact entity, actor, status, and timestamp
claimed by the browser. This rejection is intentional security behavior.

### Inbox updates but no system notification appears

Check:

- system alerts are enabled;
- browser permission is granted;
- the current device registered successfully;
- the group/category is not muted;
- Worker logs for FCM rejection;
- the device and browser support background Web Push.

### Old app code keeps loading

Use the app's **Update available — Restart** action. The PWA intentionally
caches its app shell, so an installed copy may wait for the new service worker
to activate.

### Inspect Worker logs

```bash
cd workers/push
npx wrangler tail bayadtayoopo-push-staging
```

Do not log Firebase ID tokens, FCM tokens, private keys, or full group records.

## Known limitations

- Web Push depends on browser and OS support.
- Desktop delivery can depend on whether the OS allows the browser to run
  background services.
- iOS Web Push requires a Home Screen installation.
- Events older than 24 hours are rejected by the Worker.
- Delivery markers are retained for seven days.
- Actions created while completely offline update Firestore later, but the
  current client does not queue the separate Worker request for reconnect.
  Therefore, an offline-created action may appear in the inbox without sending
  an immediate push after reconnection.
- Push delivery is best effort. The in-app inbox and Firestore group record are
  the durable source of truth.
- The older per-expense legacy payment-submission path is represented in the
  inbox, while the new group-payment ledger has the complete push lifecycle.

## Production rollout checklist

Do not point production at any staging resource.

### Firebase production

- [ ] Enable `fcm.googleapis.com`.
- [ ] Enable `fcmregistrations.googleapis.com`.
- [ ] Generate a separate production Web Push key pair.
- [ ] Put the production public VAPID key in the production build environment.

### Google service account

- [ ] Create a dedicated production push service account.
- [ ] Grant only `roles/firebasecloudmessaging.admin`.
- [ ] Confirm it has no Firestore, Owner, Editor, or Firebase Admin role.
- [ ] Create a new production-only key.
- [ ] Upload it to production Worker secrets.
- [ ] Delete the temporary local key.

### Cloudflare production

- [ ] Create a separate production KV namespace.
- [ ] Put its exact ID in `wrangler.production.toml`.
- [ ] Confirm `FIREBASE_PROJECT_ID` is the production Firebase project.
- [ ] Confirm `ALLOWED_ORIGINS` contains only approved production origins.
- [ ] Store production `FIREBASE_CLIENT_EMAIL`.
- [ ] Store production `FIREBASE_PRIVATE_KEY`.
- [ ] Deploy `npm run deploy:production` from `workers/push`.
- [ ] Verify `/health`.

### Production web app

- [ ] Set `VITE_FIREBASE_VAPID_KEY` to the production public key.
- [ ] Set `VITE_PUSH_API_URL` to the production Worker URL.
- [ ] Run all tests.
- [ ] Build production.
- [ ] Inspect the bundle for the correct public Worker URL and VAPID key.
- [ ] Deploy Hosting and Firestore rules.
- [ ] Test registration, foreground, background, closed-app, preferences, and
      deep links with two production test accounts.
- [ ] Only then announce the feature to users.

## A useful mental rule

Whenever you are unsure whether a value is safe:

```text
Browser value = visible to everyone.
Worker secret = server-only.
Firebase ID token = short-lived proof of the current user.
Firestore/KV rules = decide what that proof is allowed to do.
```

And whenever the browser claims something happened:

```text
Do not trust the claim.
Reload the saved record.
Verify actor + entity + timestamp.
Calculate recipients on the server.
```

That is the heart of this implementation.
