# BayadTayoOpo push sender

This Cloudflare Worker sends authenticated Firebase Cloud Messaging events
without requiring Firebase Cloud Functions or the Blaze plan.

Device tokens, notification preferences, and short-lived delivery markers are
stored in the bound Cloudflare KV namespace. The Google service account needs
only the Firebase Cloud Messaging API Admin role; it does not need Firestore
access. Group-event validation reads Firestore using the initiating member's
Firebase ID token, so normal Firestore Security Rules still apply.

## Configuration

1. Review `wrangler.staging.toml` or `wrangler.production.toml`. They contain
   only public project IDs and allowed Firebase Hosting origins.
2. In Firebase Console → Project settings → Cloud Messaging → Web Push
   certificates, generate a key pair. Put the public key in the web app's
   `VITE_FIREBASE_VAPID_KEY`.
3. Create a dedicated Google Cloud service account with only the Firebase
   Cloud Messaging API Admin role. Do not grant it Firestore access.
4. Store credentials as Worker secrets:

   ```sh
   npx wrangler secret put FIREBASE_CLIENT_EMAIL
   npx wrangler secret put FIREBASE_PRIVATE_KEY
   ```

5. Install and deploy:

   ```sh
   npm install
   npm run deploy:staging
   ```

6. Put the deployed Worker origin in `VITE_PUSH_API_URL`, deploy the updated
   Firestore rules, then rebuild the web app.

Use `npm run deploy:production` for production. Keep separate Worker secrets,
service accounts, VAPID keys, and web-app environment values for staging and
production.

For the full architecture, security model, beginner explanation, test plan, and
production checklist, read
[the push notification study guide](../../docs/push-notifications-guide.md).
