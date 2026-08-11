# CLAUDE.md

Guidance for working in this repo. Read the deep handoff at
`docs/SANG_EVENT_CRM_FIRESTORE_DATA_STRUCTURE.md` before touching data/rules/functions.

## What this is

Sang Event CRM — a multi-tenant event operations CRM for organizers (college fests,
conferences, corporate events, competitions, workshops). Organizers create an
organization → programs → events, import people, issue QR passes, and run gate
check-ins. It links to a separate **Sang mobile app** (attendee side) via scan-to-join
QR links.

- Firebase project: `sang-d8b93` · Hosting site: `sang-event-crm` (`sang-event-crm.web.app`)
- Functions region: `us-central1` · Functions codebase: `eventcrm`

## Layout

```
web/          React 19 + Vite 8 + TypeScript + Tailwind 4 SPA. web/src/App.tsx is the
              entire CRM (~3100 lines, single file). web/src/landing/ is the marketing page.
              web/src/lib/firebase.ts inits Firebase from VITE_FIREBASE_* env (web/.env.local).
functions/    Firebase Cloud Functions (Node 22). functions/src/index.ts holds every
              callable — all privileged writes go here. Zod-validated, permission-checked,
              audit-logged.
docs/         Authoritative Firestore data-structure + developer handoff.
firestore.rules.eventcrm.partial     Rules PARTIAL — merged into the main Sang repo, not
                                     deployed from here.
firestore.indexes.eventcrm.json      Index partial (same deploy caveat).
```

## Commands

```bash
# Web
cd web && npm run dev        # Vite dev server
cd web && npm run lint       # oxlint
cd web && npm run build      # tsc -b && vite build

# Functions
cd functions && npm run build    # tsc
cd functions && npm run serve    # build + emulators (functions:eventcrm, firestore, auth)

# Deploy (from repo root; production project)
firebase deploy --only functions --project sang-d8b93 --non-interactive
firebase deploy --only hosting:sang-event-crm --project sang-d8b93 --non-interactive
```

Before deploy: `web` lint + build pass, `functions` build passes. Deploy only the
`eventcrm` functions codebase.

## Architecture & conventions

- **All top-level collections use the `pe` prefix** ("program/event"). Every operational
  doc carries `orgId`; program-scoped docs also carry `programId`; event-scoped docs also
  carry `eventId`. Events live top-level in `peEvents` (not nested) but are invalid without
  a parent program — functions enforce this via `assertProgram`/`assertEvent`.

- **Write path (always):** UI `httpsCallable` wrapper (App.tsx ~L450) → callable in
  functions/src/index.ts → `requireUid` → Zod `.parse` → `assertPermission(uid, orgId, key)`
  → ownership checks → `db.batch()` → `writeAudit`. Never write privileged collections from
  the client; the rules deny it (`allow write: if false`).

- **Two-layer RBAC (defense in depth):**
  - Rules: `peIsActiveMember` checks `peTeamMembers/{orgId}_{uid}.status == 'active'`;
    `peHasPermission` loads that member's role doc and checks the permission (or `*`).
  - Functions: `assertPermission` re-derives the same server-side (rules can't guard
    admin-SDK writes). Member doc id is deterministic: `${orgId}_${uid}`.
  - Permission keys: `roles.write`, `team.write`, `program.read`, `program.write`,
    `event.write`, `people.import`, `passes.issue`, `checkin.scan`, `analytics.read`,
    `exports.create`, `*`. Default roles: owner / event-lead / gate-staff / analyst.

- **Frontend data model (MVP):** `CrmApp` (App.tsx ~L2959) opens ~11 live `onSnapshot`
  listeners all filtered by `activeOrgId`, then slices client-side by selected program.
  Selected org/program persist in `localStorage`. Routing is hash-based (`#/dashboard`…).

- **QR security:** tokens are sha256-hashed (`tokenHash`) and looked up by hash. Raw token
  is returned once at creation. Pass payload `SANGPASS1:{token}`, join payload
  `SANGPROGRAM1:{token}`. (Long-term: stop storing raw `qrPayload`.)

## Gotchas / known gaps

- Rules + indexes here are PARTIALS. They must be merged into the main Sang repo
  (`firestore.rules` / `firestore.indexes.json` / `storage.rules`) and deployed from there,
  not from this repo. Confirm before any rule/index change.
- CSV import (PeoplePage) loops row-by-row awaiting `createProgramPersonAndPass` — slow for
  large files, no per-row error capture; the `peImports` doc omits success/error counts.
- `useCollection` treats `permission-denied` as a transient error and swallows it — can mask
  a real rules misconfiguration.
- Check-in is paste-only ("Phase 1"), despite `html5-qrcode` being a dependency. Scanner
  token lives only in React state (lost on refresh).
- `deleteEvent` hard-deletes; programs soft-archive — inconsistent given referencing docs.
- Analytics is fully client-computed; no backend summary/bucket jobs yet.
- Not yet implemented: `joinProgramByQr` + approval queue, Sang-user linking for imported
  people, `peEventEntries` / `peProgramPartners` / async exports. See docs "Immediate Next
  Work".

## Before new work

Read the handoff doc, functions/src/index.ts (write contracts), the rules partial, and the
indexes partial. Decide whether a write belongs in the client or a Cloud Function (privileged
writes always go in a function). New sensitive screens must map to explicit permission keys.
Feature work goes on a branch, not `main`.
