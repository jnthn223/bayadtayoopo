# BayadTayoOpo payment reminder worker

This hourly Cloudflare Worker creates one scheduled reminder digest per due user.
The digest combines every unmuted group where that user still owes money. It
writes the in-app digest to the user's Firestore profile and, when enabled,
sends one branded email through Resend.

## Required encrypted secrets

- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY`
- `RESEND_API_KEY`
- `REMINDER_SIGNING_SECRET`
- `RUN_SECRET`

Use a dedicated service account with only permission to read `groups` and
read/update `users`. Never commit its JSON key or any of the secrets above.

## Domain

Verify `bayadtayoopo.whythough.space` in Resend before deploying. The sender is
`reminders@bayadtayoopo.whythough.space`, with replies directed to
`support@whythough.space`.

## Local checks

```sh
npm test
```

The reminder Worker intentionally reuses the repository's root Vitest install
and the push Worker's pinned Wrangler install, avoiding a second copy of the
same tooling.

The `/run` endpoint is for an authorized manual staging run. Pass
`Authorization: Bearer <RUN_SECRET>`. `/unsubscribe` is signed and is linked
from every reminder email.
