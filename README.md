# BayadTayoOpo

Split group expenses—no math, no drama.

BayadTayoOpo is a mobile-first group expense app for recording shared costs, calculating each member's unpaid share, collecting repayments, and keeping group activity in one place.

## Live App

https://bayadtayoopo.web.app

BayadTayoOpo runs in the browser and can be installed as a Progressive Web App (PWA). No app-store installation is required.

## Features

### Accounts and branding

- Google Sign-In and email magic-link sign-in
- Mobile-first standalone PWA experience

### Groups, invitations, and consent

- Create groups with a name, currency, and randomized group image
- Invite people through email, links, native sharing, or QR codes
- Add placeholder members before they join so expenses do not have to wait
- Generate one previewable share message containing every placeholder member's personal claim link
- Claim links connect a joining user to their existing placeholder expenses even when their account name is different
- Merge or remove unused placeholder members safely
- Group-based membership instead of a global friends list: users join through an invitation or claim flow

### Admin controls

- The original group creator is the protected group owner
- Promote joined members to co-admin or remove their co-admin access
- Placeholder members must join before they can become admins
- Co-admins can manage group details, placeholders, expenses, CSV imports, and admin access
- Only the original owner can delete the group
- Admins can record an expense on behalf of the member who actually paid upfront

### Expense splitting

- Equal and custom expense splits
- Include or exclude individual group members from an expense
- Exact cent-level allocation so split totals always remain accurate
- Live custom remainder calculation:
  - Enter a fixed amount for one member
  - The remaining balance is automatically divided among non-fixed members
  - Enter another fixed amount and the remaining shares recalculate immediately
  - Clear a fixed amount to return that member to automatic allocation
- Regular members are automatically treated as the initial payer for expenses they create
- Admins can choose another joined or placeholder member as the initial payer
- Expense creators can edit their expenses
- Expense creators and admins can delete expenses with a recorded reason

### Balances and settlements

- Clear balance labels such as `Unpaid share`, `Paid upfront · gets back`, and `All settled up`
- Suggested payments that reduce the group to the fewest practical transfers
- Home-screen indicators showing each user's unsettled payment count
- Perspective-aware wording such as `You owe Christian` or `Nathan owes you`
- Confirmed repayments are removed from outstanding balances immediately

### Payment workflow

- Optional bank, e-wallet, account, and payment instruction details per member
- Optional payment QR image
- Borrowers can mark a repayment as paid and optionally include:
  - Payment method
  - Reference number
  - Note
  - Compressed proof image
- Payment recipients can confirm or reject submitted repayments
- Rejections can include a reason for the borrower
- Expense creators can directly declare that a borrower has already paid, without requiring proof
- Payment confirmations record who confirmed them and when

### Collaboration and data tools

- Realtime group updates through Firestore
- Group chat
- Recent activity across groups
- CSV expense template downloads
- Validated CSV imports for admins
- CSV exports for existing expenses

## How Expense Amounts Work

`Initially paid by` identifies the person who paid the merchant upfront. The split amounts identify how much of that purchase belongs to each included member.

For example, for a PHP 1,998 expense where you paid upfront, Christian's share is PHP 700, and the remaining PHP 1,298 is shared by five people:

```text
Christian   PHP 700.00 (fixed)
You         PHP 259.60 (auto; already covered by your upfront payment)
Member 3    PHP 259.60 (auto)
Member 4    PHP 259.60 (auto)
Member 5    PHP 259.60 (auto)
Member 6    PHP 259.60 (auto)
```

You do not owe your own share again. The other members' unpaid shares are what you receive back.

## Placeholder Member Flow

1. An admin adds one or more placeholder members when creating a group or from the Invite sheet.
2. Those members can immediately be included in expenses.
3. The admin previews and shares a message containing a unique claim link for each placeholder.
4. A recipient signs in and claims their placeholder position.
5. Their account is connected to the existing expenses while using their actual profile name and avatar.

Only joined members can be promoted to co-admin.

## Image Storage

Firebase Storage is not required.

Payment QR codes and optional payment-proof images are compressed in the browser and stored as separate, group-protected Firestore documents under:

```text
groups/{groupId}/paymentImages/{imageId}
```

Images are kept below the Firestore document limit. This approach is intended for small QR codes and compressed proof images, not full-resolution photo storage.

## Optional PWA Installation

On iPhone:

1. Open https://bayadtayoopo.web.app in Safari.
2. Tap Share.
3. Tap Add to Home Screen.
4. Tap Add.

On Android:

1. Open https://bayadtayoopo.web.app in Chrome.
2. Open the browser menu.
3. Tap Install app or Add to Home screen.

The app shell is cached for faster startup. Group data still requires a network connection so expenses, balances, chat, and payment statuses remain current.

## Tech Stack

- React 18 and TypeScript
- Vite 6
- Tailwind CSS 4
- Firebase Authentication, Firestore, and Hosting
- Radix UI and Lucide icons
- DiceBear avatars
- Vitest

## Local Development

Use Node.js 22 or newer.

```bash
npm install
npm run dev
```

Create a `.env` file with the Firebase web application configuration:

```bash
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=
```

## Test and Build

```bash
npm test
npm run build
```

Vite generates the production application in `dist/`, which is intentionally ignored by Git.

## Firebase Setup

Before deploying, enable the following in Firebase Authentication:

- Google provider
- Email link provider if magic-link sign-in is used
- `bayadtayoopo.web.app` as an authorized domain

The repository includes:

- `firebase.json` for Hosting and Firestore rule deployment
- `firestore.rules` for user, group, and payment-image access
- `public/manifest.webmanifest` and `public/sw.js` for PWA behavior

Firebase Storage does not need to be enabled, and `storage.rules` is not deployed by the current Firebase configuration.

## Deploy

```bash
npm run build
firebase deploy --only hosting:app,firestore:rules --project bayadtayoopo
```

## Architecture Note

Groups are currently stored as serialized JSON inside their Firestore group document, while payment images use separate Firestore documents. This keeps the current realtime model straightforward, but a larger-scale version should move expenses, messages, settlements, and activity history into dedicated subcollections.

## Developer Guides

- [Push notifications explained like you’re 10](docs/push-notifications-guide.md)
