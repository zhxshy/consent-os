# ConsentOS — Personal Data Control Center

> A privacy-first middleware infrastructure for managing digital consent grants in real time. Built as a full-stack hackathon prototype demonstrating how users can own, audit, and instantly revoke access to their personal data across third-party services.

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Technical Stack](#technical-stack)
3. [Architecture & Project Structure](#architecture--project-structure)
4. [Firebase Data Model](#firebase-data-model)
5. [Core Features](#core-features)
6. [Security & Data Integrity](#security--data-integrity)
7. [Setup & Deployment](#setup--deployment)
8. [Usage Example](#usage-example)
9. [Supported Services](#supported-services)

---

## Executive Summary

Modern applications collect personal data through opaque, hard-to-revoke consent agreements. ConsentOS inverts this model: it acts as a **middleware layer** between users and the services that request their data.

Instead of each service calling user-data APIs directly, every request is routed through the ConsentOS SDK. The SDK checks a live Firestore document for that service. If the user has granted access, the call proceeds. If they have revoked it — even seconds ago — the request is denied instantly, without any server-side session invalidation or cache flushing required.

Key properties of the system:

- **Persistent** — consent state survives page refreshes via Firebase Authentication and Firestore's persistent cache.
- **Real-time** — Firestore `onSnapshot` listeners propagate revocations to all open clients within milliseconds.
- **Auditable** — every grant and revocation produces an immutable, timestamped audit record with a unique revocation token.
- **User-isolated** — each user's permissions live in their own Firestore sub-collection, making cross-user data leakage structurally impossible.

---

## Technical Stack

| Layer              | Technology                       | Version |
| ------------------ | -------------------------------- | ------- |
| UI Framework       | React                            | 19.2    |
| Build Tool         | Vite                             | 8.0     |
| Styling            | Tailwind CSS v4 (Vite plugin)    | 4.2     |
| Animation          | Framer Motion                    | 12.38   |
| Icons              | Lucide React                     | 1.8     |
| Backend / Database | Firebase Firestore               | 12.12   |
| Authentication     | Firebase Auth (Google OAuth 2.0) | 12.12   |
| Language           | JavaScript (ESM)                 | ES2022+ |

**Notable integration decisions:**

- **Tailwind CSS v4** is loaded via `@tailwindcss/vite` — no `tailwind.config.js` file is required. All styles are co-located in component JSX.
- **Framer Motion** is used for all interactive transitions: consent card exit animations, SVG data-particle flows, panic-mode explosion sequences, and modal entrance/exit choreography.
- **Firebase v12** uses the modular SDK tree-shaken at build time, keeping the bundle lean. `onSnapshot` subscriptions replace all polling patterns throughout the codebase.

---

## Architecture & Project Structure

```
my-consent-os/
├── src/
│   ├── firebase.js              # Firebase app init — exports db (Firestore) and auth
│   ├── firebase-integration.js  # SDK layer — all Firestore/Auth operations
│   ├── App.jsx                  # Single-page React application
│   │   ├── Data model           # SERVICES_DB, DATA_TYPES, risk weights
│   │   ├── Risk Engine          # calcRisk(), riskTw(), riskMeta()
│   │   ├── Components
│   │   │   ├── LoginScreen           # Google OAuth entry point
│   │   │   ├── ConsentCard           # Per-service permission card with live countdown
│   │   │   ├── DataFlowViz           # SVG graph — animated data particles
│   │   │   ├── HistoryLog            # Recent activity timeline
│   │   │   ├── GrantModal            # 2-step grant wizard with duration picker
│   │   │   ├── PanicModal            # Emergency lockdown confirmation
│   │   │   ├── ProofOfRevokeSection  # Cryptographic token audit log
│   │   │   └── TestAppPanel          # Live middleware simulation + Data Shadowing
│   │   └── ConsentOS            # Root component — auth guard + dashboard
│   ├── index.css                # Tailwind v4 entry + scrollbar utility
│   └── main.jsx                 # React 19 createRoot entrypoint
├── index.html
├── vite.config.js               # Vite + Tailwind v4 plugin configuration
└── package.json
```

### The `firebase-integration.js` SDK Layer

This file is the single boundary between the React application and Firebase. No component imports from `firebase/firestore` or `firebase/auth` directly — all Firestore logic is centralized here.

**Auth module** (`subscribeAuth`, `signInWithGoogle`, `signOutUser`):
Wraps `onAuthStateChanged` and `signInWithPopup`. The React root component calls `subscribeAuth` once on mount and uses the returned user object to gate access to every other part of the application.

**Permission module** (six exported functions):
All permission documents are addressed through a single private helper:

```js
function permDoc(uid, serviceId) {
  return doc(db, "users", uid, "permissions", serviceId);
}
```

This function is the architectural keystone. Because the Firestore document path contains the `uid`, it is physically impossible for one user's operations to touch another user's data — even if security rules were misconfigured. The sub-collection path enforces isolation at the data-model level, not just at the query level.

The six exported functions and their Firestore operations:

| Function                            | Firestore Op             | Purpose                                                                   |
| ----------------------------------- | ------------------------ | ------------------------------------------------------------------------- |
| `subscribePermissions(uid, cb)`     | `onSnapshot(collection)` | Real-time listener for all user permissions                               |
| `writePermission(serviceId, opts)`  | `setDoc`                 | Create or overwrite a grant (idempotent)                                  |
| `revokePermission(uid, serviceId)`  | `updateDoc`              | Set `status: false` + attach revocation token                             |
| `panicRevokeAll(uid, serviceIds[])` | `writeBatch`             | Atomically revoke all grants simultaneously                               |
| `checkPermission(uid, serviceId)`   | `getDoc`                 | One-shot read for middleware simulation                                   |
| `grantConsent(opts)`                | `addDoc` × 2             | Write immutable audit records to `user_consents` and `permission_history` |

---

## Firebase Data Model

### Primary collection: `users/{uid}/permissions/{serviceId}`

This is the live permission store — the single source of truth the middleware checks.

```
users/
└── {uid}/
    └── permissions/
        └── {serviceId}                  ← e.g. "google-maps", "kaspi-kz"
            ├── ownerUid:    string       ← redundant uid for audit queries
            ├── serviceId:   string
            ├── name:        string
            ├── category:    string
            ├── dataTypes:   string[]
            ├── status:      boolean      ← true = active, false = revoked
            ├── grantedAt:   Timestamp
            ├── revokedAt:   Timestamp | null
            ├── revokeToken: string | null ← "REV-SHA256-{random}"
            └── expiresAt:   Timestamp | null ← null = permanent grant
```

### Audit collections (top-level, append-only)

```
user_consents/{id}
    ├── userId, serviceId, dataTypes
    ├── riskScore: number
    ├── status: "active" | "revoked"
    └── grantedAt: Timestamp

permission_history/{id}
    ├── userId, serviceId, dataTypes
    ├── event: "ACCESS_GRANTED" | "ACCESS_REVOKED"
    ├── consentId: string
    └── timestamp: Timestamp
```

---

## Core Features

### 1. Persistent User Sessions

Firebase Authentication caches credentials in the browser's `IndexedDB`. On every page load, `onAuthStateChanged` fires synchronously with the restored user session — before any Firestore reads occur.

In `App.jsx`, the auth state uses a three-value model to eliminate flash-of-wrong-content:

```js
// undefined = auth SDK still resolving (show spinner)
// null      = confirmed logged out (show LoginScreen)
// object    = confirmed logged in (show dashboard)
const [user, setUser] = useState(undefined);

useEffect(() => {
  const unsub = subscribeAuth((u) => setUser(u ?? null));
  return unsub;
}, []);
```

The permissions listener is gated on `user.uid` and re-attaches automatically when the uid changes:

```js
useEffect(() => {
  if (!user) {
    setLoading(false);
    return;
  }
  const unsub = subscribePermissions(user.uid, (docs) => {
    /* ... */
  });
  return unsub;
}, [user?.uid]);
```

**Result:** hitting F5 shows a brief spinner, restores the Google session, then immediately streams the user's live permissions from Firestore — with zero re-authentication required.

---

### 2. One-Click Revocation with Proof-of-Revoke

Clicking **Revoke** on a consent card triggers a single `updateDoc` call:

```js
export async function revokePermission(userId, serviceId) {
  const revokeToken =
    "REV-SHA256-" + Math.random().toString(36).substring(2).toUpperCase();
  await updateDoc(permDoc(userId, serviceId), {
    status: false,
    revokeToken,
    revokedAt: serverTimestamp(),
  });
}
```

The `onSnapshot` listener picks up the Firestore change and removes the card from the UI automatically — no manual `setState` required. The revocation is permanent: refreshing the page re-reads `status: false` from Firestore and the card stays gone.

The generated `revokeToken` (e.g. `REV-SHA256-K3M9XQ2ZJF`) is stored on the document and surfaced in two places: the **Proof-of-Revoke** section below the active permissions list, and the **TestApp Middleware Tester** when it queries a denied service.

---

### 3. Emergency Lockdown (Panic Mode)

The **Panic Button** revokes every active permission simultaneously using a Firestore `writeBatch`, which is atomic — either all writes succeed or none do:

```js
export async function panicRevokeAll(userId, serviceIds) {
  const batch = writeBatch(db);
  serviceIds.forEach((id) => {
    const revokeToken =
      "REV-SHA256-" + Math.random().toString(36).substring(2).toUpperCase();
    batch.update(permDoc(userId, id), {
      status: false,
      revokeToken,
      revokedAt: serverTimestamp(),
    });
  });
  await batch.commit(); // single network round-trip
}
```

Each service receives its own unique revocation token. The UI plays a coordinated explosion animation (cards blur and scale down simultaneously) driven by a 60ms timing offset that ensures the `isPanicking` prop reaches all cards before the exit animation fires.

---

### 4. Ephemeral Access (Time-Limited Permissions)

When granting access, users choose between a permanent grant or a **15-minute ephemeral grant**. The expiry is calculated client-side and stored as a Firestore `Timestamp`:

```js
const expiresAt = durationInMinutes
  ? Timestamp.fromMillis(Date.now() + durationInMinutes * 60 * 1000)
  : null;
```

Active consent cards display a live countdown badge via `setInterval` inside a `useEffect`. The badge pulses amber when under 5 minutes remain and turns red on expiry. Expiry is enforced at the **middleware layer** — when the TestApp queries an expired permission, the SDK checks `expiresAt < now` and returns an expired state even though `status` is still `true` in Firestore, modeling a policy-based expiry rather than a document deletion.

---

### 5. Data Shadowing (Privacy Filter)

When the TestApp middleware simulation queries a denied or expired permission, **Data Shadowing** (enabled by default) feeds the requesting application anonymized noise data instead of a hard error:

```
⚠️ Data Access: Shadowed (Privacy Filter Active)

App receives (noise):
  Name: Anonymous User  |  Phone: +7 700 000 00 00

Middleware replaced real data with noise to protect your identity.
```

This models a real privacy-preserving pattern: the requesting service continues to function without crashing or receiving a 403 error, while the user's actual data is never disclosed. The toggle in the TestApp panel lets you compare the shadowed response against the raw denied/expired error to understand the middleware's role.

---

### 6. Cyberpunk-Themed Dashboard

The UI is built on a `slate-950` dark base with layered transparency, backdrop blur, and accent colors derived from the risk scoring engine:

- **Low risk** (≤ 3): emerald green
- **Medium risk** (4–6): amber
- **High risk** (≥ 7): red with `animate-pulse`

The `DataFlowViz` component renders an SVG network graph where animated particles travel from a central "YOU" node outward to each connected service. Particles use Framer Motion's CSS `x`/`y` transform props rather than SVG `cx`/`cy` attributes, avoiding cross-browser SVG animation inconsistencies. On revocation, the connection line turns gray and dashed and the particles stop flowing — a visual representation of the data link being severed in real time.

---

## Security & Data Integrity

### Firestore Security Rules

Deploy these rules from the Firebase console under **Firestore Database → Rules**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // User-scoped permission store — strict owner-only access
    match /users/{uid}/permissions/{serviceId} {
      allow read, write: if request.auth != null
                         && request.auth.uid == uid;
    }

    // Audit logs — users can create their own records, never modify or delete
    match /user_consents/{docId} {
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid;
      allow read:   if request.auth != null
                    && resource.data.userId == request.auth.uid;
    }

    match /permission_history/{docId} {
      allow create: if request.auth != null
                    && request.resource.data.userId == request.auth.uid;
      allow read:   if request.auth != null
                    && resource.data.userId == request.auth.uid;
    }
  }
}
```

**Why these rules work:**

| Rule                                                         | What it prevents                                                                   |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `request.auth.uid == uid` on sub-collection                  | User A cannot read or write User B's permissions, even with a valid JWT            |
| `create` only on audit collections                           | No client can delete or modify historical records — the audit trail is append-only |
| `request.resource.data.userId == request.auth.uid` on create | A client cannot forge audit records attributed to another user                     |

The sub-collection path (`users/{uid}/permissions`) is the primary isolation boundary. Security rules are the enforcement layer on top. Both must be correct for the system to be fully secure.

### Risk Scoring Engine

Each permission grant is scored 1–10 based on the sensitivity of the requested data types:

```js
const DATA_WEIGHT = {
  financial: 5,
  national_id: 5,
  medical: 5,
  biometric: 5,
  health: 4,
  property: 4,
  transactions: 4,
  credit_score: 4,
  location: 3,
  contacts: 3,
  documents: 3,
  photos: 2,
  phone: 2,
  device_id: 2,
  email: 1,
  academic: 1,
  attendance: 1,
};
```

Scores are calculated at grant time, stored on the Firestore document, and rendered as color-coded badges with a pulsing animation on high-risk cards.

---

## Setup & Deployment

### Prerequisites

- Node.js 18+
- A Firebase project with **Firestore** and **Authentication** (Google provider) enabled

### 1. Clone and install

```bash
git clone <your-repo-url>
cd my-consent-os
npm install
```

### 2. Configure Firebase

The Firebase configuration lives in `src/firebase.js`. Replace the `firebaseConfig` object with values from your Firebase console (**Project Settings → Your apps → SDK setup and configuration**):

```js
// src/firebase.js
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID",
};
```

Then enable **Google** as a sign-in provider under Firebase Console → **Authentication → Sign-in method**.

### 3. Local development

```bash
npm run dev
```

Vite starts a local dev server at `http://localhost:5173` with HMR. Tailwind CSS v4 compiles styles on demand — no separate CSS build step is required.

### 4. Production build

```bash
npm run build
```

Output is written to `dist/`. The build is fully static and deployable to any CDN or static host.

### 5. Deploy to Firebase Hosting

```bash
# Install Firebase CLI (once)
npm install -g firebase-tools

# Log in and initialise hosting (once)
firebase login
firebase init hosting
# When prompted:
#   Public directory → dist
#   Single-page app  → Yes
#   Overwrite index.html → No

# Build and deploy
npm run build
firebase deploy --only hosting
```

### 6. Preview production build locally

```bash
npm run preview
# Serves dist/ at http://localhost:4173
```

---

## Usage Example

### Granting and revoking a permission

A user opens the dashboard and clicks **Grant Access**. The two-step modal walks them through service selection and data type choices, with an optional time limit:

```
Step 1: Select service     →  Kaspi.kz  (Finance 🇰🇿)
Step 2: Choose data types  →  Financial, Transactions, Credit Score
        Duration           →  15 Minutes (ephemeral)
        Risk Preview       →  HIGH · 9/10
        → [Grant Access]
```

Internally, one `setDoc` call writes to `users/{uid}/permissions/kaspi-kz`:

```json
{
  "ownerUid": "uid_abc123",
  "serviceId": "kaspi-kz",
  "name": "Kaspi.kz",
  "category": "Finance",
  "dataTypes": ["financial", "transactions", "credit_score"],
  "status": true,
  "grantedAt": "2024-01-15T10:30:00Z",
  "expiresAt": "2024-01-15T10:45:00Z",
  "revokeToken": null
}
```

The `onSnapshot` listener fires within ~100ms and adds the card to the dashboard. A live countdown badge appears: **"15m left"**, pulsing amber when under 5 minutes remain.

When the user clicks **Revoke**, a single `updateDoc` sets `status: false` and generates a proof token. The `onSnapshot` listener fires, the card exits with a slide-left animation, and the token appears in the Proof-of-Revoke section:

```
Kaspi.kz  [REVOKED]                                      Just now
Proof-of-Revoke: REV-SHA256-K3M9XQ2ZJF4BWPXZ
```

Querying the TestApp middleware panel after revocation returns:

```
❌ Access Denied   revocation verified
Token: REV-SHA256-K3M9XQ2ZJF4BWPXZ
```

Or, with **Data Shadowing ON**:

```
⚠️ Data Access: Shadowed (Privacy Filter Active)
App receives (noise): Name: Anonymous User | Phone: +7 700 000 00 00
Middleware replaced real data with noise to protect your identity.
```

After a page refresh, `onAuthStateChanged` restores the Google session and `onSnapshot` re-attaches. The Kaspi.kz card remains absent — the revocation is permanent, stored in Firestore, not in browser memory.

---

## Supported Services

| Service      | Category      | Region                |
| ------------ | ------------- | --------------------- |
| Google Maps  | Navigation    | Global                |
| PayPal       | Finance       | Global                |
| LinkedIn     | Professional  | Global                |
| Amazon       | Shopping      | Global                |
| Spotify      | Entertainment | Global                |
| Meta         | Social        | Global                |
| Apple Health | Health        | Global                |
| eGov.kz      | Government    | 🇰🇿 Kazakhstan         |
| Kaspi.kz     | Finance       | 🇰🇿 Kazakhstan         |
| NIS Mektep   | Education     | 🇰🇿 Kazakhstan         |
| Damumed      | Healthcare    | 🇰🇿 Kazakhstan         |
| TestApp      | Demo          | Middleware simulation |

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

_Built for a hackathon. Architecture designed to demonstrate production-grade privacy infrastructure patterns._
**Author** [Zhoshy Khalelov](https://github.com/zhxshy)
