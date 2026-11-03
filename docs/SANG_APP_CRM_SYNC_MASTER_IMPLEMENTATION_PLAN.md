# Sang App And Event CRM Sync Master Implementation Plan

Last updated: 2026-08-21

Audience: product owner, QA tester, Sang mobile developer, Event CRM developer, future CRM mobile app developer

Repos:

- CRM web/functions repo: `C:\Users\Admin\Documents\sang_event_crm`
- Sang mobile app repo: `C:\Users\Admin\Documents\sang`
- CRM GitHub repo: `https://github.com/thesangapp-glitch/cms-software.git`
- Sang app GitHub repo: `https://github.com/nikhil23p/sang.git`

Firebase:

- Project: `sang-d8b93`
- Functions region: `us-central1`
- CRM functions codebase: `eventcrm`
- CRM hosting: `https://sang-event-crm.web.app`

## 1. Purpose

This document explains what has been built, what the Sang mobile app and Event CRM currently sync, what every important button does, which Firestore documents are involved, why the flow is implemented this way, and what still needs testing or future work.

This should be used when:

- testing Sang mobile app and CRM sync end to end
- onboarding another developer
- building a future CRM mobile app with the same organizer features
- auditing Firebase reads, permissions, and data ownership
- preparing event pilots or demos

## 2. Product Summary

Sang has two connected products:

1. Sang mobile app
   - Used by attendees, participants, delegates, speakers, guests, and Sang users.
   - Shows the user's events, pass QR, schedule, people directory, patrons, and networking context.
   - Handles Sang-to-Sang connections by card QR, pass QR, and scan event mode.

2. Sang Event CRM
   - Used by organizers and team members.
   - Creates organizations, programs, events, venues, schedules, patrons, people rosters, passes, and mobile publish snapshots.
   - Links CRM roster people to verified Sang users.
   - Publishes mobile-safe event data to the Sang app.
   - Shows event connection analytics from Sang app connections.

The core idea:

> Organizer creates and publishes program data in CRM. Sang users claim or receive event access in the mobile app. The app reads mobile-safe mirrors and backend functions instead of reading sensitive CRM collections directly.

## 3. Current Built Status

### Built In CRM

- Organization onboarding and multi-organization workspace selection.
- Role and team permission model.
- Program creation and editing with logo, banner, poster, dates, time, venue, rich description, and directions.
- Program venue library with rooms/halls and coordinates.
- Event creation and editing under a program.
- Event mobile publish snapshot through `publishProgramEvents`.
- Schedule creation and editing in dashboard source documents.
- Schedule publish snapshot through `publishProgramSchedule`.
- People roster manual add, edit, CSV import, event access, roles, organization, designation, and pass issue.
- People mobile publish through `publishProgramPeopleAccess`.
- Mobile-safe people public directory at `pePrograms/{programId}/peoplePublic/{programPersonId}`.
- People role chips source at `pePrograms/{programId}.peopleDirectoryRoles`.
- Pass issue with `SANGPASS1:{token}` payload and 8 digit display pass code.
- Mobile pass refresh through `getMyEventPass`.
- Mobile schedule fetch through `getMyProgramSchedule`.
- Mobile people directory through `getEventPeopleDirectory`.
- Show my card sync through `setEventShowCard`.
- Event person card preview through `getEventPersonCard`.
- Pass QR to Sang connection resolution through `resolveEventPassForConnection`.
- Program connection analytics through `getProgramConnectionAnalytics`.
- Dashboard publish buttons and publish reminder messages.
- Dashboard networking analytics panel.

### Built In Sang Mobile App

- Bottom Events tab.
- Event list screen with Events and Past Events tabs.
- Claim my event icon in Events header.
- Claim result bottom sheet with linked, pending, and review counts.
- Pull-to-refresh on Events list.
- Event detail screen with About, Schedule, People, Pass, and Patrons.
- Immediate detail navigation with cached/skeleton state for smoother UX.
- About screen using live program and event details.
- Schedule screen using backend-filtered schedule data.
- People screen with role chips from `pePrograms.peopleDirectoryRoles`.
- Show my card toggle in People tab.
- Event person row click opens safe card/details popup.
- Pass screen reads `getMyEventPass` instead of direct `pePasses`.
- Scanner supports event mode and event suggestions.
- Scanner supports `SANGPASS1:{token}` pass QR as a connection source.
- Connection saves event metadata into Sang connection docs and `connectionPairs`.
- Push notification deep link opens event detail from `event_program_access`.

### In Progress / Needs Deploy Check

CRM `functions/src/index.ts` currently has a local change that appears to auto-select a user's default active Sang card for new event directory access unless the card has `eventDirectoryVisibleByDefault === false`. Confirm deployment status before relying on this behavior in production.

## 4. Why The Sync Is Designed This Way

### Why Mobile Does Not Read CRM Source Collections Directly

Sensitive source collections include private attendee details, pass token hashes, operational status, scanner sessions, and audit logs. Direct mobile reads would risk exposing data that attendees should not see.

Mobile should not directly read:

- `pePasses`
- full `peProgramPeople`
- `peCheckIns`
- `peScannerSessions`
- `peAuditLogs`
- full raw event management fields that are organizer-only

Instead:

- The app reads `users/{uid}/eventAccess/{programId}` for "my program access".
- The app calls backend functions for pass, schedule, people directory, card preview, and pass QR resolution.
- Public directory rows are mirrored into `pePrograms/{programId}/peoplePublic`.
- Schedule is published into a mobile snapshot so the app does not read large draft schedule data.

### Why Publish Buttons Exist

CRM editing and mobile attendee display have different needs.

The organizer can edit drafts, private notes, and operational details. The mobile app should only show a stable attendee-safe version. Publish buttons let organizers decide when edited content becomes visible in the Sang app.

The dashboard has:

- Publish events
- Publish people
- Publish schedule

These are separate because organizers often edit one area without wanting to republish everything.

### Why Claim My Event Exists

CRM can link a person only when a Sang user's verified email or verified phone matches the CRM roster row. The mobile app may be installed after the organizer uploads the person. Claim My Event gives the user a manual sync action after login or verification.

### Why Pass QR Can Create A Sang Connection

At an event, a user may show their event pass QR instead of their Sang card QR. The app can scan `SANGPASS1:{token}`, ask the backend which Sang card belongs to that pass, and then create a normal Sang connection with event metadata. This makes event networking easier and captures analytics.

### Why Connection Analytics Is In CRM

Connection analytics is organizer-facing. The Sang mobile user does not need event-wide analytics. CRM reads `connectionPairs` by `programId` through `getProgramConnectionAnalytics` and shows totals on the selected program dashboard.

## 5. End-To-End Data Flow

### Organizer Setup Flow

1. CRM user signs in.
2. CRM creates or selects organization.
3. CRM creates program.
4. CRM adds venue, events, schedule, patrons, and people.
5. CRM issues passes as part of people creation or publish.
6. Organizer publishes events, people, and schedule.
7. Backend writes mobile-safe mirrors and snapshots.
8. Sang app user opens Events and claims access if needed.
9. Sang app shows event, pass, schedule, people, and patrons.
10. User connects with other Sang users during the event.
11. Connection writes program/event metadata.
12. CRM dashboard analytics shows connection counts.

### Mobile Access Flow

1. Sang user signs in.
2. App session attempts claim after auth where appropriate.
3. User can manually tap Claim my event.
4. Backend reads verified identities:
   - Firebase Auth verified email
   - Firebase Auth phone number
   - `users/{uid}.verifiedEmail`
   - `users/{uid}.verifiedPhone`
5. Backend matches `peProgramPeople.normalizedEmail`, `email`, `normalizedPhone`, or `phone`.
6. If exactly one active person matches in a program:
   - `peProgramPeople` is linked with `sangUid`
   - `users/{uid}/eventAccess/{programId}` is written
   - `pePrograms/{programId}/peoplePublic/{programPersonId}` is updated
7. The Events tab renders the program.

### Pass Refresh Flow

1. User opens Pass tab.
2. App calls `getMyEventPass({ programId })`.
3. Backend verifies the current auth uid has `users/{uid}/eventAccess/{programId}`.
4. Backend reads `pePasses/{passId}`.
5. Backend verifies pass belongs to the same `programId` and `programPersonId`.
6. Backend returns:
   - `passQrPayload`
   - `passCode`
   - `passStatus`
   - `updatedAt`
7. Backend refreshes the mirror with the latest pass fields.

### Schedule Flow

1. Organizer creates schedule rows in CRM.
2. Rows are stored in dashboard/source schedule docs.
3. Organizer clicks Publish schedule.
4. Backend writes mobile-safe schedule snapshot:
   - `peProgramSchedule/{programId}`
   - `peProgramSchedulePages/{programId}_001`, etc when needed
5. App calls `getMyProgramSchedule({ programId })`.
6. Backend reads the user's access mirror and filters schedule rows by:
   - event access
   - role-based visibility
   - cancelled/draft filtering as published
7. App renders allowed schedule rows.

### People Directory Flow

1. Organizer adds people and event access in CRM.
2. Organizer clicks Publish people.
3. Backend writes:
   - `users/{uid}/eventAccess/{programId}` for linked Sang users
   - `pePrograms/{programId}/peoplePublic/{programPersonId}` safe directory rows
   - `pePrograms/{programId}.peopleDirectoryRoles`
4. App reads role chips from `pePrograms.peopleDirectoryRoles`.
5. App calls `getEventPeopleDirectory({ programId, roleKey, cursor })`.
6. Backend verifies access mirror exists.
7. Backend returns only safe public directory fields.
8. If row has `showCard === true`, tapping it can call `getEventPersonCard`.

### Show My Card Flow

1. User opens People tab.
2. User toggles Show my card.
3. App calls `setEventShowCard({ programId, showCard, selectedCardId })`.
4. Backend verifies the user owns event access.
5. If turning on and no card id is passed, backend chooses the user's default active card.
6. Backend updates:
   - `users/{uid}/eventAccess/{programId}`
   - `pePrograms/{programId}/peoplePublic/{programPersonId}`
   - `peProgramPeople/{programPersonId}`
7. Other users can see this row as tappable and can preview safe card details.

### Pass QR Connection Flow

1. User A shows pass QR from Pass tab.
2. User B opens Sang Scan.
3. Scanner reads `SANGPASS1:{token}`.
4. App calls `resolveEventPassForConnection({ payload })`.
5. Backend:
   - verifies pass token hash
   - rejects revoked/expired/blocked passes
   - reads `peProgramPeople`
   - finds linked Sang user
   - picks selected event card or default Sang card
   - returns card public key plus event context
6. App opens normal Resolved Card flow using the returned card.
7. Connection saves event context in:
   - user's private connection docs
   - `connectionPairs/{pairId}`
8. CRM analytics counts the connection by `programId`.

## 6. Firestore Data Structure

### CRM Source Collections

| Collection | Owner | Purpose | Mobile reads directly? |
| --- | --- | --- | --- |
| `peUsers/{uid}` | CRM | CRM user profile and active org | No |
| `peOrganizations/{orgId}` | CRM | Organizer organization | No |
| `peOrganizations/{orgId}/roles/{roleId}` | CRM | CRM role permissions | No |
| `peTeamMembers/{teamMemberId}` | CRM | Staff/team access | No |
| `pePrograms/{programId}` | CRM | Program source plus mobile public summary fields | Limited read from app for live program presentation |
| `peProgramVenues/{programId}` | CRM | Program venue catalog | No direct mobile dependency |
| `peEvents/{eventId}` | CRM | Event source docs | Limited safe rules currently exist; prefer mobile snapshot |
| `peEventScheduleDashboard/{scheduleItemId}` | CRM | Editable schedule source of truth | No |
| `peProgramPeople/{programPersonId}` | CRM | Full roster and private identity | No |
| `pePasses/{passId}` | CRM/backend | Pass token hash and QR payload | No |
| `peProgramPartners/{partnerId}` | CRM | Patrons/sponsors | Yes, only visible fields |
| `peCheckIns/{checkInId}` | Backend | Entry scan records | No |
| `peAuditLogs/{auditId}` | Backend | Audit history | No |

### Mobile-Safe Mirrors And Snapshots

| Path | Written by | Used by | Purpose |
| --- | --- | --- | --- |
| `users/{uid}/eventAccess/{programId}` | CRM backend | Sang app | Main "my event" mirror |
| `peProgramMobileEvents/{programId}` | `publishProgramEvents` | Sang app | Published mobile event list |
| `peProgramSchedule/{programId}` | `publishProgramSchedule` | Backend callable | Published schedule root |
| `peProgramSchedulePages/{programId}_001` | `publishProgramSchedule` | Backend callable | Large schedule pages |
| `pePrograms/{programId}/peoplePublic/{programPersonId}` | People publish/show card | Backend callable | Safe people directory |
| `connectionPairs/{pairId}` | Sang app functions | CRM analytics | Cross-user connection analytics |

### `users/{uid}/eventAccess/{programId}`

Main app fields:

```ts
{
  uid: string,
  orgId: string,
  programId: string,
  programPersonId: string,

  passId: string,
  passQrPayload: string,
  passCode: string,
  passStatus: 'issued' | 'checkedIn' | 'revoked' | 'expired' | 'cancelled' | 'blocked',

  programName: string,
  programTagline: string,
  programType: string,
  mode: 'standalone' | 'multiEvent',
  status: 'draft' | 'live' | 'archived',
  startDate: Timestamp,
  endDate: Timestamp,
  startTime?: string,
  endTime?: string,
  timezone: string,

  venueName: string,
  city: string,
  address: string,
  directionsNote: string,
  latitude?: number,
  longitude?: number,

  logoUrl?: string,
  bannerUrl?: string,
  posterUrl?: string,
  description?: string,

  personName: string,
  personOrganization: string,
  personCompany: string,
  personDesignation: string,
  personKind: string,
  programRoleId: string,
  programRoleName: string,

  showCard?: boolean,
  selectedCardId?: string,

  allowedEventIds: string[],
  eventAccess: Record<string, EventAccess>,
  eventAccessList: EventAccess[],
  eventCount: number,

  linkStatus: 'linked' | 'pending' | 'manual_review',
  linkMethod: 'verified_email' | 'verified_phone' | 'manual' | '',
  updatedAt: Timestamp
}
```

### `pePrograms/{programId}.peopleDirectoryRoles`

Used by mobile People tab role chips.

```ts
peopleDirectoryRoles: [
  { key: 'attendee', label: 'Attendee', count: 120 },
  { key: 'delegate', label: 'Delegate', count: 30 }
]
```

Mobile UI currently hides the count in chips, but CRM keeps the count for future analytics and admin views.

### `pePrograms/{programId}/peoplePublic/{programPersonId}`

Safe person row:

```ts
{
  programId: string,
  programPersonId: string,
  sangUid?: string,
  selectedCardId?: string,
  displayName: string,
  organization: string,
  company: string,
  designation: string,
  roleName: string,
  roleKey: string,
  avatarUrl?: string,
  initials: string,
  showCard: boolean,
  status: 'active' | 'inactive',
  sortName: string,
  updatedAt: Timestamp
}
```

### `connectionPairs/{pairId}`

Event connection analytics fields:

```ts
{
  pairId: string,
  users: string[],
  status: 'pending' | 'connected' | 'blocked',
  scannerUid: string,
  qrShownByUid: string,
  programId?: string,
  eventId?: string,
  eventName?: string,
  eventMeta?: {
    mode: 'scan' | 'show_qr',
    event?: string,
    programId?: string,
    eventId?: string,
    city?: string,
    country?: string,
    address?: string,
    latitude?: number,
    longitude?: number
  },
  connectedAt: Timestamp,
  updatedAt: Timestamp
}
```

CRM dashboard analytics reads these through backend function only.

## 7. Cloud Functions Contract

### Mobile-Facing Event Functions

| Function | Called by | Input | Output | Why |
| --- | --- | --- | --- | --- |
| `claimMyEventAccess` | Sang app Events/after auth | `{}` | linked/pending/review counts | Links verified Sang user to CRM roster |
| `getMyEventPass` | Sang app Pass tab | `{ programId }` | `passQrPayload`, `passCode`, `passStatus` | Keeps `pePasses` private |
| `getMyProgramSchedule` | Sang app Schedule tab | `{ programId }` | filtered schedule rows | Applies access and role rules server-side |
| `getEventPeopleDirectory` | Sang app People tab | `{ programId, roleKey, cursor }` | safe people rows | Paginates and protects roster data |
| `setEventShowCard` | Sang app People tab toggle | `{ programId, showCard, selectedCardId }` | selected card state | Lets user control card visibility |
| `getEventPersonCard` | Sang app People row click | `{ programId, programPersonId }` | safe person + optional public card | Shows only allowed shared card info |
| `resolveEventPassForConnection` | Sang app scanner | `{ payload }` | card short id + event context | Lets pass QR work as connection QR |

### CRM-Facing Publish And Analytics Functions

| Function | Called by | Input | Output | Why |
| --- | --- | --- | --- | --- |
| `publishProgramEvents` | CRM dashboard/events page | `{ orgId, programId }` | item count | Builds mobile event snapshot |
| `publishProgramPeopleAccess` | CRM dashboard/people page | `{ orgId, programId, notify }` | people/linking counts | Links users and publishes people access |
| `publishProgramSchedule` | CRM dashboard/schedule page | `{ orgId, programId }` | item/page count | Builds mobile schedule snapshot |
| `getProgramConnectionAnalytics` | CRM dashboard | `{ orgId, programId }` | total/event-wise counts | Shows Sang networking impact |

### Staff/Entry Functions

| Function | Called by | Input | Output | Current status |
| --- | --- | --- | --- | --- |
| `createScannerSession` | Future scanner UI | org/program/event/gate | scanner token | Backend live, CRM UI hidden |
| `scanPassToken` | Future scanner UI | scanner token + pass payload | approved/duplicate/denied | Backend live, CRM UI hidden |

## 8. Button And UI Behavior

### CRM Dashboard

| Button/Area | What happens | Data touched | Why implemented |
| --- | --- | --- | --- |
| Open events | Navigates to Events page for selected program | None | Organizer quickly edits program events |
| Publish events | Calls `publishProgramEvents` | Reads `peEvents`, writes `peProgramMobileEvents/{programId}`, updates `pePrograms.eventsLastPublishedAt` | Mobile should see only published event data |
| Publish people | Calls `publishProgramPeopleAccess` | Reads `peProgramPeople`, writes access mirrors, peoplePublic, pass fields, notifications, `peopleDirectoryRoles` | Links Sang users and publishes directory/pass access |
| Publish schedule | Calls `publishProgramSchedule` | Reads schedule source, writes schedule mobile root/pages | Keeps schedule drafts separate from attendee-visible data |
| Networking analytics Refresh | Calls `getProgramConnectionAnalytics` | Reads `connectionPairs` server-side | Shows event networking value to organizer |
| Publish reminder | Shows changed-after-publish message | Compares local `updatedAt` with published timestamps | Prevents organizer forgetting to publish |

### CRM Events Page

| Button/Area | What happens | Data touched | Why |
| --- | --- | --- | --- |
| Create event | Opens event form | None until save | Adds sub-events/sessions under program |
| Save event | Calls create/update event function | Writes `peEvents` | Keeps event writes permission/audit controlled |
| Delete/archive event | Calls delete event function | Updates/removes `peEvents` as implemented | Organizer can clean incorrect events |
| Publish events | Calls `publishProgramEvents` | Mobile event snapshot | Makes event changes visible in app |

### CRM People Page

| Button/Area | What happens | Data touched | Why |
| --- | --- | --- | --- |
| Add person | Opens person form | None until save | Manual roster entry |
| Save person | Creates/updates person and pass | `peProgramPeople`, `pePasses` | Person and pass are source data |
| Edit person | Opens existing person | Writes only on save | Role/access corrections |
| Publish to Sang | Calls `publishProgramPeopleAccess` | Access mirrors, public directory, notifications | Makes roster visible in Sang app |
| CSV upload | Imports many people | `peProgramPeople` | Fast event onboarding |

### CRM Schedule Page

| Button/Area | What happens | Data touched | Why |
| --- | --- | --- | --- |
| Add schedule row | Creates draft/source row | `peEventScheduleDashboard` | Organizer can build full schedule |
| Save schedule | Writes dashboard source | `peEventScheduleDashboard` | Editing remains private until publish |
| Publish schedule | Calls `publishProgramSchedule` | `peProgramSchedule`, `peProgramSchedulePages` | Mobile receives filtered safe schedule |

### Sang App Events List

| Button/Area | What happens | Data touched | Why |
| --- | --- | --- | --- |
| Events tab | Opens event list | Reads `users/{uid}/eventAccess`, program snapshots | User sees their programs |
| Claim my event icon | Calls `claimMyEventAccess` through refresh | Links matching roster rows | User can sync after organizer publish |
| Pull to refresh | Calls refresh/claim flow and reloads list | Access mirror and program docs | Natural mobile sync action |
| Event card tap | Navigates to detail immediately with initial cached event | Reads detail sources in background | Avoids slow perceived navigation |

### Sang App Event Detail

| Tab | What happens | Data touched | Why |
| --- | --- | --- | --- |
| About | Shows program details, pass summary, event list, how to reach, access | Access mirror, program doc, mobile event snapshot | Main event overview |
| Schedule | Shows day/time/event filtered schedule | Calls `getMyProgramSchedule` | Server-side role filtering |
| People | Shows role chips, public people list, show-card control | Reads `pePrograms.peopleDirectoryRoles`, calls people functions | Safe networking directory |
| Pass | Shows entry pass QR and pass code | Calls `getMyEventPass` | Fresh pass status without direct `pePasses` read |
| Patrons | Shows visible patrons/sponsors | Reads `peProgramPartners` visible fields | Organizer branding and sponsor value |

### Sang App Scan

| Button/Area | What happens | Data touched | Why |
| --- | --- | --- | --- |
| Card to share | Selects which Sang card scanner shares back | Local app state | User controls identity |
| Connection tag | Applies scan tag | Connection docs | User categorizes contacts |
| Event mode toggle | Enables event context for scans | Local preference, connection meta | Event connections should carry event analytics |
| Event suggestions | Suggests current/known event context | Event access/cache | Reduces manual typing |
| Show my QR | Goes to user's QR | None | Fast reciprocal exchange |
| Scan card QR | Normal Sang card connection | `scanSessions`, `connectionPairs`, user connection docs | Existing Sang connection flow |
| Scan pass QR | Calls `resolveEventPassForConnection`, then normal connect flow | CRM pass/person/card lookup, connection docs | Lets event pass also work for networking |

## 9. Sync Testing Checklist Summary

Use the dedicated checklist:

- `docs/SANG_APP_CRM_SYNC_QA_CHECKLIST.md`

Minimum smoke test:

1. Create/edit program in CRM.
2. Add a Sang mobile test user to CRM people with verified email/phone.
3. Publish events, people, and schedule.
4. Open Sang app Events.
5. Tap Claim my event.
6. Confirm program appears.
7. Open About, Schedule, People, Pass, Patrons.
8. Toggle Show my card.
9. Scan another user's pass QR or card QR with Event mode on.
10. Refresh CRM dashboard networking analytics.

## 10. Read Count Notes

### Events List

Expected mobile reads with one listed program:

- `users/{uid}/eventAccess` listener: one document read per visible program.
- `pePrograms/{programId}` listener: one document read per program.

Approximate first load for one program: 2 Firestore document reads plus any cache/network refresh overhead.

### Event Detail

About first load can read:

- `users/{uid}/eventAccess/{programId}`
- `pePrograms/{programId}`
- `peProgramMobileEvents/{programId}`
- `peProgramPartners` query result docs
- callable reads when opening schedule/pass/people

Schedule, pass, and people are backend calls, so Firestore reads happen server-side and only safe data returns to the app.

### Analytics

CRM dashboard analytics calls `getProgramConnectionAnalytics`. The backend reads up to 1,000 `connectionPairs` docs with matching `programId`. This is manual/refresh driven, not a real-time listener.

Future optimization:

- Maintain aggregated counters per program/event when a connection is created.
- Keep dashboard analytics reads constant even for very large events.

## 11. Future CRM Mobile App Build Plan

The future CRM mobile app should not directly copy the Sang attendee app. It should be organizer/staff focused.

Recommended first CRM mobile app modules:

1. Login and organization/program selection.
2. Dashboard summary:
   - people count
   - passes issued
   - publish pending warnings
   - connection analytics
3. People quick search and person detail.
4. Add/edit person and issue pass.
5. Publish people/events/schedule buttons.
6. Event list and schedule viewer/editor.
7. Pass scanner/check-in when scanner UI is re-enabled.
8. Offline-friendly scanner queue, only after backend undo/repair flow exists.

Must reuse backend functions where possible:

- Do not let CRM mobile write pass tokens directly.
- Do not let CRM mobile write access mirrors directly.
- Do not let CRM mobile bypass permission checks.
- Use existing CRM functions or add new callables with the same permission model.

## 12. What Still Needs Work

### Product/UX

- Finalize whether default Show my card should be on for new event access or off until explicit consent.
- Add richer event connection reports/export from CRM.
- Add organizer-facing scanner/check-in UI if event gate workflow is needed.
- Add event-specific "connection made at this event" report.
- Add attendee-facing invite/share event flows later if product requires it.

### Backend

- Consider aggregated analytics counters to reduce future read cost.
- Backfill `connectionPairs.programId` for old event connections only if reliable metadata exists.
- Add automated tests for timestamp parsing, schedule filtering, and people directory pagination.
- Add stronger mobile-safe event snapshots so full `peEvents` docs do not need direct mobile reads.

### CRM Web

- Split very large `web/src/App.tsx` into smaller feature modules.
- Add code-splitting to reduce Vite bundle warning.
- Add export buttons for networking analytics.
- Add clear deployment checklist inside CRM UI or docs.

### Sang Mobile

- Finish broader accessibility label pass across primary card and auth flows.
- Device-test pass QR to connection flow with real users.
- Device-test slow network states for Events detail, Pass, and People.
- Add local test fixtures for event access data.

## 13. Deployment Rules

### CRM Functions

CRM event functions are deployed from:

```bash
C:\Users\Admin\Documents\sang_event_crm
firebase deploy --only functions:eventcrm:<functionName> --project sang-d8b93
```

Use this repo for Event CRM owned functions:

- `claimMyEventAccess`
- `getMyEventPass`
- `getMyProgramSchedule`
- `getEventPeopleDirectory`
- `setEventShowCard`
- `getEventPersonCard`
- `resolveEventPassForConnection`
- `getProgramConnectionAnalytics`
- CRM create/update/publish functions

### Sang App Functions

Do not run broad `firebase deploy --only functions` from the Sang app repo.

Use the safe script only:

```bash
C:\Users\Admin\Documents\sang
npm run deploy:functions:sang
```

This protects CRM `eventcrm` functions from accidental deletion.

### Firestore Rules

Firestore rules are project-wide. Deploy merged rules from the Sang app repo, not from CRM alone.

## 14. Developer Handoff Checklist

- [ ] Read this document fully.
- [ ] Read `docs/SANG_MOBILE_EVENT_CRM_INTEGRATION_GUIDE.md`.
- [ ] Read `docs/SANG_EVENT_CRM_FIRESTORE_DATA_STRUCTURE.md`.
- [ ] Read `docs/SANG_APP_CRM_SYNC_QA_CHECKLIST.md`.
- [ ] Confirm which repo you are editing before changing code.
- [ ] Confirm whether you are changing CRM repo or Sang app repo.
- [ ] Confirm whether functions belong to CRM `eventcrm` codebase or Sang app default codebase.
- [ ] Do not expose `pePasses` to mobile.
- [ ] Do not expose full `peProgramPeople` to mobile.
- [ ] Do not remove publish buttons unless replacing them with a better publish workflow.
- [ ] Test with one linked Sang user and one non-Sang/pending user.
- [ ] Test with at least two audience roles.
- [ ] Test with one event that user can access and one event that user cannot access.
- [ ] Test schedule with role-based visibility.
- [ ] Test people directory Show my card on and off.
- [ ] Test pass QR connection.
- [ ] Test CRM dashboard analytics after creating a connection.
