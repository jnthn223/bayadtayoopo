# BayadTayoOpo email reminders — setup guide

## What this feature does

Once per schedule, BayadTayoOpo creates one reminder digest for each user who
still owes money. A digest combines every eligible group. It appears in the
app, and—unless the user turns email off—is sent as one branded email.

The scheduler deliberately ignores:

- settled groups;
- muted or currently snoozed groups;
- the portion already covered by a payment awaiting confirmation; and
- a new balance until it has existed for at least three days.

The email explains that users may settle in full or make a partial payment.
Every group has a direct link to its Settle Up tab.

## Default settings

- Email summary: on
- In-app reminder: on
- Frequency: weekly
- Day: Friday
- Time: 9:00 AM
- Time zone: Asia/Manila

Users can change these settings from Profile → Notifications. They may mute a
group, snooze it for seven days, or unsubscribe directly from an email.

## Why there is a separate Worker

The browser cannot reliably run while the app is closed. A Cloudflare Worker
runs hourly, checks whose preferred local time has arrived, calculates the
projected outstanding balance, and sends due emails through Resend.

It is separate from the push Worker so its Firestore permissions and email API
key are isolated.

## 1. Verify the sending subdomain in Resend

1. Create or open your Resend account.
2. Add `bayadtayoopo.whythough.space` as a sending domain.
3. In the DNS provider for `whythough.space`, add the SPF and DKIM records
   shown by Resend exactly as provided.
4. Wait until Resend reports the domain as verified.
5. Create a sending-only API key for BayadTayoOpo.

The configured identity is:

- From: `BayadTayoOpo <reminders@bayadtayoopo.whythough.space>`
- Reply-To: `support@whythough.space`

## 2. Create least-privilege Firebase service accounts

Create separate staging and production service accounts for the reminder
Worker. They need to read `users` and `groups`, and update reminder fields on
`users`. Do not reuse the FCM-only push account and never commit either JSON
key.

Firestore REST calls made with this account use IAM rather than client security
rules. Keep the role restricted to the reminder Worker and rotate the key if it
is ever exposed.

## 3. Store encrypted Worker secrets

From `workers/reminders`, add these secrets separately for staging and
production:

```sh
../push/node_modules/.bin/wrangler secret put FIREBASE_CLIENT_EMAIL --config wrangler.staging.toml
../push/node_modules/.bin/wrangler secret put FIREBASE_PRIVATE_KEY --config wrangler.staging.toml
../push/node_modules/.bin/wrangler secret put RESEND_API_KEY --config wrangler.staging.toml
../push/node_modules/.bin/wrangler secret put REMINDER_SIGNING_SECRET --config wrangler.staging.toml
../push/node_modules/.bin/wrangler secret put RUN_SECRET --config wrangler.staging.toml
```

Repeat with `wrangler.production.toml` and the production Firebase account.
`REMINDER_SIGNING_SECRET` signs one-click unsubscribe links. `RUN_SECRET`
protects the manual test endpoint. Use independent random values for staging
and production.

## 4. Deploy and test staging

First deploy the app and Firestore rules:

```sh
npm run deploy:staging
```

Then deploy the staging reminder Worker:

```sh
npm run deploy:reminders:staging
```

The staging Worker has no automatic Cron trigger. Call its `/run` endpoint with
the staging `RUN_SECRET` when you intentionally want to test a batch.

Confirm that:

1. the recipient gets one email, not one per group;
2. balances and currencies are correct;
3. pending-payment amounts are excluded from the amount requested;
4. each group link opens Settle Up;
5. Customize reminders opens Profile → Notifications;
6. unsubscribe disables email only; and
7. the same digest appears in the app.

## 5. Deploy production

After staging passes:

```sh
npm run deploy:production
npm run deploy:reminders:production
```

Production runs hourly. It sends only when the user's preferred local hour and
schedule match. The Worker caps email at 95 messages per UTC day, leaving a
small buffer below Resend's free daily limit. Once the cap is reached, email is
skipped safely while in-app behavior remains available.

## Security reminders

- Never paste service-account keys or Resend keys into source files or chat.
- Use different Firebase keys and signing secrets in staging and production.
- Keep the email content limited to balances; payment instructions and proofs
  remain behind authenticated app access.
- Rotate a secret immediately if it is accidentally exposed.
