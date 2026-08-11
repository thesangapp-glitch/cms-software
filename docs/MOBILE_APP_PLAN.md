# Sang Event CRM — Mobile Companion App Plan

Date: 2026-08-10
Stack: React Native + Expo (managed), TypeScript, Expo Router
Backend: existing Firebase project `sang-d8b93`, functions region `us-central1`,
functions codebase `eventcrm`. **No backend changes required for this plan.**

## Decisions (confirmed)

1. **Repository:** standalone repo (separate from `cms-software`). Firebase config is
   shared via environment variables, not code sharing.
2. **Auth:** Firebase Authentication is the identity system (backend rules/callables all
   depend on `request.auth.uid`). Google sign-in obtains a Google OAuth credential which is
   exchanged into Firebase Auth via `signInWithCredential`.
3. **Participant rule:** permission-level only. A guard (role with `checkin.scan`) can scan;
   any valid pass for the selected gate is accepted. `scanPassToken` is used as-is — no
   `kind` filtering, no Cloud Function change.

## Goal

A gate/operations app with two audiences, gated by role permission:

- **Guard** (`checkin.scan`): open the camera, scan a person's pass QR, and instantly see
  **Matched Success** when the QR is a valid, invited pass for this event/gate.
- **Admin** (`analytics.read`, typically alongside `checkin.scan`): everything a guard sees
  plus event analytics.

Only users who have been granted access (an active `peTeamMembers` row via role assignment)
can get past the sign-in gate.

## What the backend already provides (reused as-is)

- Callables in `functions/src/index.ts`:
  - `claimTeamAccess` — links email invites to the signed-in user.
  - `setActiveOrganization` — sets `peUsers/{uid}.activeOrgId`.
  - `createScannerSession` — returns `{ scannerSessionId, scannerToken }` (raw token once).
  - `scanPassToken` — validates session + hashes the scanned token, finds the pass by
    `tokenHash`, confirms it belongs to the session's org/program, writes an idempotent
    `peCheckIns` doc, flips pass/person to `checkedIn` on first approval. Returns
    `approved` | `duplicate` (+ `passId`, `programPersonId`).
- RBAC: `peTeamMembers/{orgId}_{uid}` (status `active`) → `roleId` →
  `peOrganizations/{orgId}/roles/{roleId}.permissions`. Keys used here: `checkin.scan`,
  `analytics.read`, `program.read`.
- QR contract: pass payload `SANGPASS1:{token}`. **Matched Success == `approved` result.**
- Firestore reads allowed to active members: `peProgramPeople`, `pePasses`, `peCheckIns`,
  `pePrograms`, `peEvents`, roles.

## Proposed dependencies

- `expo`, `expo-router`, TypeScript
- `firebase` (JS SDK v12, same major as web) with `initializeAuth` +
  `getReactNativePersistence(AsyncStorage)`
- `expo-auth-session` + `expo-web-browser` (Google OAuth → Firebase credential)
- `expo-camera` (QR scanning; QR-only `barcodeScannerSettings`)
- `expo-secure-store` (holds the scanner token; never logged)
- `expo-haptics` (scan feedback)
- `@react-native-async-storage/async-storage` (Firebase auth persistence)

## Project structure (Expo Router)

```
app/
  _layout.tsx            root providers (Auth, theme)
  index.tsx              redirect by auth + permission state
  sign-in.tsx            Google sign-in
  no-access.tsx          authenticated but not authorized
  (tabs)/
    _layout.tsx          permission-gated tab bar
    scanner.tsx          guard scanner
    analytics.tsx        admin analytics
    settings.tsx         org/program switcher, sign out
src/
  lib/firebase.ts        init + persistence
  lib/auth.tsx           AuthContext: firebase user, profile, role, permissions
  lib/callables.ts       typed httpsCallable wrappers
  lib/permissions.ts     hasPermission helpers + constants
  lib/models.ts          shared types (mirror web App.tsx)
  features/scanner/      camera, session, result UI
  features/analytics/    summaries, live check-in feed
  components/            shared UI (StatusBadge, ResultOverlay, etc.)
```

---

## Phase 0 — Foundations

- Scaffold Expo + TypeScript + Expo Router; ESLint; base theme matching Sang branding.
- `src/lib/firebase.ts`: init from `EXPO_PUBLIC_FIREBASE_*` env; `initializeAuth` with
  AsyncStorage persistence.
- Typed callable wrappers and shared models (`ProgramPerson`, `Pass`, `CheckIn`, `Role`,
  `TeamMember`, `Program`, `Event`).
- Deliverable: app boots, connects to Firebase, blank authed/unauthed routing.

## Phase 1 — Auth & access gate

- **Sign-in:** `expo-auth-session/providers/google` → obtain Google `idToken` →
  `signInWithCredential(auth, GoogleAuthProvider.credential(idToken))`.
- **Authorize (two-layer, same as web):**
  1. On Firebase auth, call `claimTeamAccess` (best-effort, timeout-guarded).
  2. Read `peUsers/{uid}`. If missing or `organizationIds` empty → **not authorized** →
     `no-access` screen + sign out. Anyone can *authenticate*; only invited/role-assigned
     users get *in*.
  3. Resolve `activeOrgId` → active `peTeamMembers` row → role doc → permission set.
- **Permission-driven navigation:**
  - `checkin.scan` → Scanner tab
  - `analytics.read` → Analytics tab
  - both → both tabs (admin)
- Deliverable: only authorized users reach the tabs; tabs reflect their permissions.

## Phase 2 — Scanner (core guard flow)

- **Session setup:** select program (+ optional event + gate name) → `createScannerSession`
  → persist `scannerToken` in SecureStore.
- **Camera:** `expo-camera` `CameraView`, QR-only, with permission prompt + framing overlay.
- **Verify:** on decode → `scanPassToken({ scannerSessionId, scannerToken, payload,
  deviceScanId })` (fresh `deviceScanId` per scan for idempotency).
- **Result overlay:**
  - `approved` → full-screen green **Matched Success** + person name + success haptic
  - `duplicate` → amber "Already checked in"
  - error → red "Not valid for this gate" (not found / wrong org / bad session)
- Person name via `peProgramPeople/{programPersonId}` read (allowed for active members).
- Scan hygiene: cooldown between scans, recent-scans list, graceful network-error handling.
- Deliverable: guard scans a real `SANGPASS1:` pass and sees the correct result state.

## Phase 3 — Permission enforcement

- Hard-gate Scanner behind `checkin.scan`; hide/deny otherwise.
- Participant rule is satisfied at the permission level (guard = scan-only). Documented as a
  deliberate choice; a future backend `kind` filter is noted but out of scope.
- Deliverable: a guard-only account can scan and nothing else.

## Phase 4 — Admin analytics

- Gate behind `analytics.read`.
- Reuse web's client-side computation over org/program data:
  - totals: people, checked-in, scan records; per-program check-in rate.
  - **live check-in feed** via a `peCheckIns` listener (ordered by `createdAt`).
- Optional: recent audit activity (`peAuditLogs`, needs `analytics.read`).
- Deliverable: admin sees live event health after check-ins happen.

## Phase 5 — Polish & release

- Org/program switcher, sign-out, loading/empty/error states, offline resilience.
- EAS build config, app icon/splash, production env, store metadata.
- QA against production `sang-d8b93` with a temporary guard and admin user; clean up.
- Mobile README + this plan kept in sync.

## Cross-cutting

- Scanner token lives only in SecureStore; never logged (honors the "no raw tokens" rule).
- No new Firestore rules/indexes (all reads/writes use existing permissions and callables).
- Keep models and permission keys aligned with `web/src/App.tsx` to avoid drift.
