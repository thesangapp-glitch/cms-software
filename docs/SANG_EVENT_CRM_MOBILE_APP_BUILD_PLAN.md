# Sang Event CRM Mobile App Build Plan

Last updated: 2026-08-21

Purpose: define how to build a future CRM mobile app for organizers/staff using the same backend and product logic as the Sang Event CRM web portal.

This is not the attendee Sang app. This is the organizer/staff CRM app.

## 1. Product Role

The CRM mobile app should help organizers run an event from a phone.

Primary users:

- Owner/admin
- Program coordinator
- Event coordinator
- Gate executive
- On-ground operations team

Primary jobs:

- See program dashboard quickly.
- Check whether mobile publish is pending.
- Add/search/edit people.
- Issue or refresh passes.
- Publish event data to Sang app.
- View connection analytics.
- Scan/check-in attendees when scanner UI is re-enabled.

## 2. What The CRM Mobile App Should Reuse

Reuse existing Firebase project and backend:

- Firebase project: `sang-d8b93`
- Functions region: `us-central1`
- CRM functions codebase: `eventcrm`

Use existing Cloud Functions wherever possible:

- `createOrganization`
- `updateOrganization`
- `setActiveOrganization`
- `claimTeamAccess`
- `createProgram`
- `updateProgram`
- `createEvent`
- `updateEvent`
- `createScheduleItem`
- `updateScheduleItem`
- `deleteScheduleItem`
- `createProgramPersonAndPass`
- `updateProgramPersonAccess`
- `issuePassForProgramPerson`
- `publishProgramEvents`
- `publishProgramPeopleAccess`
- `publishProgramSchedule`
- `getProgramConnectionAnalytics`
- `createScannerSession`
- `scanPassToken`

Do not bypass backend functions for sensitive writes.

## 3. Recommended First Release Scope

### Release 1: Organizer Companion

Screens:

1. Sign in
2. Organization picker
3. Program picker
4. Program dashboard
5. Publish center
6. People search/list
7. Person detail
8. Add/edit person
9. Event list
10. Schedule list
11. Networking analytics

Do not include:

- Full desktop-grade settings editor
- Bulk CSV import
- Complex rich text editing
- Full sponsor management
- Check-in scanner, unless operations policy is ready

Reason:

The first CRM mobile app should be fast and operational, not a full desktop replacement.

## 4. Recommended Second Release Scope

### Release 2: On-Ground Operations

Add:

- Scanner/check-in mode
- Gate/session selector
- Offline scan queue
- Duplicate scan handling
- Undo/repair workflow for mis-scan
- Quick attendee lookup by name, email, phone, or pass code
- Export/share daily report

Important:

Do not ship scanner without an undo/repair path. A wrong check-in should be recoverable by authorized staff.

## 5. Permission Model

The CRM mobile app must use the same role model as the web CRM.

| Role | Mobile access |
| --- | --- |
| Owner | Full organization/program access |
| Program coordinator | Assigned program dashboard, people, publish, schedule |
| Event coordinator | Assigned event/program-limited views |
| Gate executive | Scanner/check-in only when scanner module ships |

Never trust client-side role checks alone. Backend functions must enforce permissions.

## 6. Data Read Strategy

### Direct Firestore Reads Allowed For CRM Mobile

The CRM mobile app is an organizer app, so it can read more CRM data than the attendee Sang app, but still through rules and role scope.

Use direct reads for:

- `peUsers/{uid}`
- `peOrganizations/{orgId}`
- `peTeamMembers`
- `pePrograms`
- `peEvents`
- `peProgramPeople`
- `peProgramPartners`
- `peEventScheduleDashboard`
- `peProgramVenues`

Use backend functions for:

- pass issue/refresh
- access publishing
- schedule publishing
- event publishing
- connection analytics
- scanner session
- pass scan/check-in
- any audit-sensitive write

### Reads To Avoid In CRM Mobile

Avoid direct mobile reads unless a specific screen needs them and rules are reviewed:

- `peAuditLogs`
- raw scanner sessions
- raw check-in dedupe keys
- pass token hash fields

## 7. Screen Details

### Sign In

Use Firebase Auth.

After sign-in:

1. Read `peUsers/{uid}`.
2. If profile missing, call `claimTeamAccess`.
3. If no organization, show setup or "ask admin to invite".
4. If multiple organizations, show organization picker.

### Organization Picker

Shows organizations user can access.

On select:

- call `setActiveOrganization({ orgId })`
- save active org in CRM user profile
- load program picker/dashboard

### Program Picker

Shows programs available to current role scope.

Fields:

- name
- date range
- venue
- status
- poster/banner thumbnail

Action:

- tap program -> dashboard

### Program Dashboard

Show:

- program name
- date/venue
- people count
- passes issued
- events count
- publish pending status
- connection analytics summary

Buttons:

- Publish events
- Publish people
- Publish schedule
- Open people
- Open events
- Open schedule

### Publish Center

Purpose:

Make it very obvious when mobile Sang app data is stale.

Show three rows:

1. Events
2. People
3. Schedule

Each row:

- last published time
- current pending status
- publish button
- success/error result

### People List

Features:

- search by name, email, phone, organization, role
- filter by role
- filter by linked/pending/manual review
- filter by pass status
- tap person detail

### Person Detail

Show:

- full name
- email
- phone
- organization
- designation
- program role
- event access list
- Sang link status
- pass status
- pass code

Actions:

- edit person
- issue/refresh pass
- block access
- remove access
- publish people after changes

### Add/Edit Person

Use function:

- create: `createProgramPersonAndPass`
- update: `updateProgramPersonAccess`

Fields:

- full name
- email
- phone
- organization
- designation
- program role
- event-wise access

Do not:

- write pass docs directly
- write `users/{uid}/eventAccess` directly

### Event List

Show:

- event name
- date/time
- venue
- status
- mobile visible status
- allowed roles

Actions:

- create/edit event
- publish events

### Schedule List

Show:

- chronological schedule
- event filter
- role visibility
- room/venue

Actions:

- create/edit row
- publish schedule

### Networking Analytics

Call:

- `getProgramConnectionAnalytics({ orgId, programId })`

Show:

- total connections
- unique Sang users
- event-wise breakdown
- latest activity

Future:

- export CSV/PDF
- compare by role/event/day
- aggregate counters for large events

## 8. Data Write Rules

The CRM mobile app may call functions that write:

- `pePrograms`
- `peEvents`
- `peEventScheduleDashboard`
- `peProgramPeople`
- `pePasses`
- mobile publish snapshots
- access mirrors
- audit logs

But it should not write these directly from the client when the operation needs permission logic, pass issue, or audit:

- `pePasses`
- `users/{uid}/eventAccess`
- `pePrograms/{programId}/peoplePublic`
- `peProgramSchedule`
- `peProgramSchedulePages`
- `peProgramMobileEvents`
- `peCheckIns`
- `peAuditLogs`

## 9. Offline Strategy

Release 1:

- basic Firestore offline cache is acceptable for read-only views
- do not allow offline publish
- do not allow offline pass issue

Release 2 scanner:

- offline scan queue can be considered only with:
  - scanner session validity
  - idempotency keys
  - retry state
  - conflict handling
  - undo/repair workflow

## 10. UI/UX Principles

- Dashboard first, not marketing.
- Use compact professional cards.
- Use clear status chips.
- Put publish warnings near publish buttons.
- Keep destructive actions behind confirmation.
- Avoid large decorative hero sections in operational screens.
- Use skeleton states for slow network calls.
- Keep all publish actions explicit.
- For phone use, prioritize one-handed actions:
  - bottom sheets
  - sticky primary buttons
  - large tap targets
  - searchable lists

## 11. Build Checklist

- [ ] Confirm CRM web and mobile share same Firebase project.
- [ ] Confirm auth provider setup.
- [ ] Implement organization picker.
- [ ] Implement program picker.
- [ ] Implement dashboard.
- [ ] Implement publish center.
- [ ] Implement people list.
- [ ] Implement person detail.
- [ ] Implement add/edit person through functions.
- [ ] Implement event list.
- [ ] Implement schedule list.
- [ ] Implement networking analytics.
- [ ] Add role-based route guards.
- [ ] Add error/empty/loading states.
- [ ] Add audit-safe function calls for all sensitive writes.
- [ ] Test with owner, program coordinator, event coordinator, and gate executive.
- [ ] Test with linked and pending Sang attendees.

## 12. Open Decisions

- Should CRM mobile app be built in React Native/Expo alongside Sang app, or as a responsive PWA first?
- Should scanner/check-in ship in CRM mobile release 1 or release 2?
- Should owner/admin be able to create new organizations from mobile?
- Should rich text editing be mobile-editable or desktop-only?
- Should connection analytics export be available on mobile?
- Should default Show my card be on for new event access, or explicit opt-in only?
