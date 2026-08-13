# Sang Mobile App Event CRM Integration Guide

Last updated: 2026-08-12

This document is the handoff for the Sang mobile app developer. It explains how the Sang Event CRM data appears inside the existing Sang app, which Firestore documents the mobile app should read, which Cloud Functions it should call, and which collections must stay backend-only.

## Current Product Contract

The mobile app is the attendee/participant side of the event product. The CRM web portal is the organizer side.

Important decisions:

- The Sang app should show a program/event only when the user has been added to the CRM roster and linked to that Sang account.
- Program scan-to-join is not part of the current plan. Do not implement `SANGPROGRAM1`, `peProgramJoinLinks`, or `peProgramJoinRequests`.
- The only QR payload currently used for entry/check-in is the pass QR: `SANGPASS1:{token}`.
- The mobile app should not read `pePasses` directly. The safe QR payload is mirrored to `users/{uid}/eventAccess/{programId}.passQrPayload`.
- Operational date/time fields are Firestore `Timestamp`, not strings. Mobile should convert them with the platform SDK.
- The same Firebase project is used by CRM and Sang mobile: `sang-d8b93`.
- Cloud Functions region: `us-central1`.

## High-Level Flow

1. Organizer creates organization, program, events, audience roles, venues, schedule, and people roster in CRM.
2. CRM stores attendees/participants in `peProgramPeople`.
3. CRM issues passes in `pePasses`.
4. Organizer clicks publish in CRM.
5. Backend matches roster rows to existing Sang users by verified email or verified phone.
6. Backend writes the mobile mirror under `users/{uid}/eventAccess/{programId}`.
7. Sang app reads only the user's own `eventAccess` mirror for the Events tab.
8. Sang app calls `getMyProgramSchedule({ programId })` for the published schedule.
9. Sang app renders the entry pass QR from `passQrPayload`.
10. Staff scanner validates the QR through `scanPassToken`; the app should never validate the token locally.

## Mobile App Responsibilities

Implement these app surfaces:

1. Events tab in bottom navigation.
2. Program list from `users/{uid}/eventAccess`.
3. Program detail screen from the selected mirror document.
4. Event list inside a program using `eventAccessList`.
5. Schedule screen using `getMyProgramSchedule({ programId })`.
6. Entry pass screen that renders `passQrPayload`.
7. Patrons tab using `peProgramPartners` for visible sponsors/patrons.
8. Push notification handling for newly linked programs.
9. Claim/sync action after login and after email/phone verification.
10. Entry pass refresh through `getMyEventPass({ programId })`; mobile must not read `pePasses` directly.
11. Optional staff scanner flow if Sang app will be used by gate staff.

Current Sang app implementation files:

- `src/services/eventAccess.ts`: Firestore listeners for access, live program/event docs, schedules, patrons, and `claimMyEventAccess` callable wrapper.
- `src/hooks/useEventAccess.ts`: React hooks for Events list/detail screens.
- `src/screens/EventsScreen.tsx`: reads live program access instead of `MOCK_EVENTS`.
- `src/screens/EventDetailScreen.tsx`: reads selected program access and published program schedule data.
- `src/data/mockEvents.ts`: still owns shared UI types; mock rows are no longer the primary Events screen source.

## Authentication And Identity Matching

The backend can link CRM roster rows to a Sang user only when the Sang user has a verified identity.

Required Sang user fields:

```ts
users/{uid}
{
  verifiedEmail?: string,   // lower-case email, only after verification
  verifiedPhone?: string,   // normalized E.164 phone, example +919999999999
  displayName?: string,
  photoUrl?: string,
  updatedAt?: Timestamp
}
```

The backend checks both Firebase Auth and the Sang user document:

- `authUser.email` is used only if `authUser.emailVerified == true`.
- `authUser.phoneNumber` is used when available.
- `users/{uid}.verifiedEmail` is also used when MyInfo email verification has written it.
- `users/{uid}.verifiedPhone` is also used when MyInfo phone verification has written it.

Mobile implementation:

- After login, make sure email or phone verification is complete.
- After verification, call `claimMyEventAccess`.
- If user has no verified email/phone, the function returns zero links.

## Push Token Registration

CRM publish sends a best-effort FCM notification to Sang users. The backend currently queries the top-level `devices` collection.

Recommended device document:

```ts
devices/{deviceId}
{
  uid: string,
  fcmToken: string,
  platform: 'ios' | 'android' | 'web',
  active: true,
  notificationPermission: 'granted' | 'denied' | 'unknown',
  appVersion?: string,
  updatedAt: Timestamp,
  createdAt?: Timestamp
}
```

Notification payload sent by backend:

```ts
{
  notification: {
    title: 'Program added on Sang',
    body: '{programName} is ready in the Sang app.'
  },
  data: {
    type: 'event_program_access',
    orgId: '{orgId}',
    programId: '{programId}',
    url: 'sang://events/{programId}'
  }
}
```

Mobile behavior:

- On notification tap, navigate to `Events -> Program detail`.
- If the mirror document is not available yet, call `claimMyEventAccess` and retry the read.

## Primary Mobile Read Model

### `users/{uid}/eventAccess/{programId}`

This is the main document for the Sang Events tab. Mobile should treat this as the primary source for which programs/events the logged-in user can see.

Written by backend only:

- `createProgramPersonAndPass` when a roster person immediately matches a verified Sang user.
- `publishProgramPeopleAccess` when organizer publishes roster access.
- `claimMyEventAccess` when the user logs in and claims matching roster rows.
- `issuePassForProgramPerson` when the pass is rotated/refreshed.
- `scanPassToken` updates `passStatus` after approved check-in.

Mobile read path:

```ts
users/{uid}/eventAccess/{programId}
```

Example document:

```ts
{
  uid: 'sangUserUid',
  orgId: 'org_123',
  programId: 'program_123',
  programPersonId: 'person_123',

  passId: 'pass_123',
  passQrPayload: 'SANGPASS1:rawTokenValue',
  passCode: '48291370', // 8-digit display/support code, not the scanner credential
  passStatus: 'issued', // issued | checkedIn | revoked | expired | cancelled

  programName: 'Tech Fest 2026',
  programTagline: 'A short mobile subtitle for list/hero UI',
  programType: 'college_fest', // college_fest | conference | corporate_event | custom
  mode: 'multiEvent',          // standalone | multiEvent
  status: 'draft',             // draft | live | archived

  startDate: Timestamp,
  endDate: Timestamp,
  timezone: 'Asia/Kolkata',

  venueName: 'Main Campus',
  city: 'Roorkee',
  address: 'IIT Roorkee, Uttarakhand',
  latitude: 29.8543,
  longitude: 77.8880,

  logoUrl: 'https://...',
  bannerUrl: 'https://...',
  posterUrl: 'https://...',
  description: '<p>Rich about text from CRM</p>',
  directionsNote: '<p>Gate, parking, metro, hall route, and entry notes.</p>',

  personName: 'Nikhil',
  personOrganization: 'Farmicon',
  personCompany: 'Farmicon',
  personDesignation: 'Founder',
  personKind: 'participant',
  programRoleId: 'participant',
  programRoleName: 'Participant',

  linkStatus: 'linked',
  linkMethod: 'verified_email', // verified_email | verified_phone | manual

  allowedEventIds: ['event_1', 'event_2'],
  eventCount: 2,

  eventAccess: {
    event_1: {
      eventId: 'event_1',
      eventNameSnapshot: 'Startup Pitch',
      eventTypeSnapshot: 'competition',
      eventDescription: '<p>Event/session about text.</p>',
      eventPosterUrl: 'https://...',
      eventVenueName: 'Main Hall',
      eventLocationNote: 'Hall 2',
      eventDirectionsNote: '<p>Use Gate 1, then follow startup desk signs.</p>',
      eventAddress: 'Main Campus',
      eventStartDateTime: Timestamp,
      eventEndDateTime: Timestamp,
      roleId: 'startup',
      roleName: 'Startup',
      status: 'allowed'
    },
    event_2: {
      eventId: 'event_2',
      eventNameSnapshot: 'AI Workshop',
      roleId: 'participant',
      roleName: 'Participant',
      status: 'allowed'
    }
  },

  eventAccessList: [
    {
      eventId: 'event_1',
      eventNameSnapshot: 'Startup Pitch',
      eventTypeSnapshot: 'competition',
      eventDescription: '<p>Event/session about text.</p>',
      eventPosterUrl: 'https://...',
      eventVenueName: 'Main Hall',
      eventLocationNote: 'Hall 2',
      eventDirectionsNote: '<p>Use Gate 1, then follow startup desk signs.</p>',
      eventAddress: 'Main Campus',
      eventStartDateTime: Timestamp,
      eventEndDateTime: Timestamp,
      roleId: 'startup',
      roleName: 'Startup',
      status: 'allowed'
    }
  ],

  eventRoleKeys: ['event_1:startup', 'event_2:participant'],

  nextScheduleTitle: 'Registration opens',
  nextScheduleAt: Timestamp,
  updatedAt: Timestamp
}
```

Mobile display rules:

- Hide or mark programs with `status == archived`.
- Show active/upcoming/past by comparing `startDate` and `endDate`.
- If `eventAccessList` is empty and `mode == standalone`, show the program as a single program-level experience.
- If `eventAccessList` has items, show event cards inside the program.
- Hide event access entries with status `blocked`, `cancelled`, `rejected`, or `revoked`.
- A user's role can be different in different events. Always read the role from the event access entry, not only from `programRoleName`.

Recommended Events tab query:

```ts
db.collection('users')
  .doc(uid)
  .collection('eventAccess')
  .onSnapshot(...)
```

Client should sort locally:

1. Live/current programs.
2. Upcoming programs.
3. Past programs.
4. Archived hidden by default.

## Schedule Data For Mobile

Mobile should call the backend callable, not read CRM schedule rows directly.

Callable:

```ts
getMyProgramSchedule({ programId })
```

Backend behavior:

- Verifies `users/{uid}/eventAccess/{programId}` exists.
- Reads the published schedule index from `peProgramSchedule/{programId}`.
- Reads item pages from `peProgramSchedulePages/{pageId}`.
- Filters role-based rows against the user's event/program role.
- Returns only safe mobile fields.

Published schedule index:

```ts
peProgramSchedule/{programId}
{
  orgId: string,
  programId: string,
  mode: 'empty' | 'paged',
  pageSize: number,
  itemCount: number,
  version: number,
  pages: [
    {
      pageId: string,       // example: `${programId}_p001`
      pageNo: number,
      itemCount: number,
      dateKeys: string[]
    }
  ],
  days: [
    {
      dateKey: string,
      dateLabel: string,
      itemCount: number,
      pageIds: string[]
    }
  ],
  updatedAt: Timestamp
}
```

Important: `peProgramSchedule/{programId}` intentionally does not store the full `items` array. It is metadata only. This prevents the same schedule from being duplicated in both root and page documents.

Published schedule pages:

```ts
peProgramSchedulePages/{pageId}
{
  orgId: string,
  programId: string,
  pageNo: number,
  itemCount: number,
  dateKeys: string[],
  items: [
    {
      id: string,
      eventId: string,
      title: string,
      type: 'session' | 'round' | 'break' | 'checkin' | 'performance' | 'result' | 'ceremony' | 'custom',
      customTypeLabel: string,
      description: string,
      startsAt: Timestamp,
      endsAt: Timestamp | null,
      timezone: string,
      venueId: string,
      roomId: string,
      venueName: string,
      roomName: string,
      latitude?: number,
      longitude?: number,
      visibility: 'public' | 'participantsOnly' | 'rolesOnly',
      allowedRoleIds: string[],
      allowedRoleNames: string[],
      status: string,
      sortOrder: number,
      workshops?: Array<object>
    }
  ],
  updatedAt: Timestamp
}
```

Callable response:

```ts
{
  id: programId,
  programId,
  itemCount: number,
  items: ScheduleItem[],
  days: ScheduleDay[],
  updatedAt: Timestamp | null
}
```

Important:

- Organizer controls publishing manually from CRM with "Publish schedule".
- `draft`, `cancelled`, and `staffOnly` items are filtered out before the snapshot is written.
- Child rows with `parentScheduleItemId` appear inside parent item `workshops`.
- Sort by `sortOrder`, then `startsAt`.
- Use `updatedAt` and local cache to avoid unnecessary UI refreshes.

## Event Detail Read

### `peEvents/{eventId}`

The mobile app may read event docs for event-level poster, description, venue notes, speaker/profile data, and entry settings. Rules allow a Sang user to read only events listed in their `users/{uid}/eventAccess/{programId}.allowedEventIds`.

Useful fields:

```ts
peEvents/{eventId}
{
  orgId: string,
  programId: string,
  name: string,
  eventType: string,
  description: string,
  startDateTime: Timestamp | null,
  endDateTime: Timestamp | null,
  multiDate: boolean,
  venueName: string,
  locationNote: string,
  directionsNote: string,
  address: string,
  latitude?: number,
  longitude?: number,
  posterUrl: string,
  entryScope: 'program' | 'event' | 'both',
  competitive: boolean,
  resultsEnabled: boolean,
  profiles: [
    {
      id: string,
      name: string,
      role: string,
      organization: string,
      bio: string,
      photoUrl: string
    }
  ],
  allowedAudienceRoleIds: string[],
  allowedAudienceRoleNames: string[],
  scheduleItemCount: number,
  nextScheduleTitle: string,
  nextScheduleAt: Timestamp | null,
  status: 'draft' | 'live' | 'completed',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Entry rule:

- If a scanner session is event-level, `scanPassToken` checks `peEvents/{eventId}.allowedAudienceRoleIds`.
- If the user's event role is not in `allowedAudienceRoleIds`, check-in is denied.
- If the event should allow participants/startups/delegates, CRM must configure those allowed audience roles.

## Program Detail Read

### `pePrograms/{programId}`

The mirror document stores the mobile-critical program fields, but the current mobile detail screen also reads `pePrograms/{programId}` for fresher program tagline, about text, artwork, venue, date, and how-to-reach updates. Rules allow a Sang user to read only programs where `users/{uid}/eventAccess/{programId}` exists.

Useful fields if direct read is enabled:

```ts
pePrograms/{programId}
{
  orgId: string,
  name: string,
  mode: 'standalone' | 'multiEvent',
  tagline: string,
  programType: string,
  startDate: Timestamp,
  endDate: Timestamp,
  timezone: string,
  venueName: string,
  city: string,
  address: string,
  latitude?: number,
  longitude?: number,
  logoUrl: string,
  bannerUrl: string,
  posterUrl: string,
  description: string,
  directionsNote: string,
  entryScope: 'program' | 'event' | 'both',
  competitive: boolean,
  resultsEnabled: boolean,
  status: 'draft' | 'live' | 'archived',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Recommended behavior:

- Use `users/{uid}/eventAccess/{programId}` as the access/pass authority.
- Use `pePrograms/{programId}` as a live display overlay for program profile fields.

## Patrons And Sponsors For Mobile

### `peProgramPartners/{partnerId}`

This collection stores attendee-facing patrons/sponsors for a program. It is safe for mobile reads after the user has access to that program. The mobile app should query by `programId` and hide `status == hidden`.

Example:

```ts
peProgramPartners/{partnerId}
{
  orgId: string,
  programId: string,
  name: string,
  tier: string,        // Title Partner, Gold Patron, Exhibitor, custom
  category: string,    // Fintech, community, hiring, etc.
  booth: string,       // A1, Hall 2, Booth 18
  description: string, // rich text from CRM; mobile may render plain text first
  websiteUrl: string,
  logoUrl: string,
  sortOrder: number,
  status: 'active' | 'hidden',
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Recommended mobile query:

```ts
db.collection('peProgramPartners')
  .where('programId', '==', programId)
  .onSnapshot(...)
```

Deferred:

- People directory for mobile should not directly expose `peProgramPeople`. Build a safe attendee directory snapshot/callable with profile visibility consent later.
- Standalone program schedule is deferred. For production standalone programs, create a default event or add `peProgramSchedule/{programId}` later.

## Backend-Only Collections

These collections are important for understanding the system, but the attendee Sang app should not read/write them directly.

### `peProgramPeople/{programPersonId}`

CRM roster person document. One document per person per program. If the same real person attends two programs, they get two different `peProgramPeople` documents.

Shape:

```ts
{
  orgId: string,
  programId: string,

  fullName: string,
  email: string,
  phone: string,
  normalizedEmail: string,
  normalizedPhone: string,
  company: string,
  organization: string,
  designation: string,

  kind: string,
  programRoleId: string,
  programRoleName: string,

  eventAccessIds: string[],
  eventAccess: {
    [eventId: string]: {
      eventId: string,
      eventNameSnapshot: string,
      eventTypeSnapshot: string,
      eventDescription: string,
      eventPosterUrl: string,
      eventVenueName: string,
      eventLocationNote: string,
      eventDirectionsNote: string,
      eventAddress: string,
      eventStartDateTime: Timestamp | null,
      eventEndDateTime: Timestamp | null,
      roleId: string,
      roleName: string,
      status: 'allowed' | 'registered' | 'blocked' | 'cancelled' | 'rejected' | 'revoked'
    }
  },
  eventAccessList: Array<{
    eventId: string,
    eventNameSnapshot: string,
    eventTypeSnapshot: string,
    eventDescription: string,
    eventPosterUrl: string,
    eventVenueName: string,
    eventLocationNote: string,
    eventDirectionsNote: string,
    eventAddress: string,
    eventStartDateTime: Timestamp | null,
    eventEndDateTime: Timestamp | null,
    roleId: string,
    roleName: string,
    status: string
  }>,
  eventRoleKeys: string[],

  passId: string,
  passStatus: 'issued' | 'checkedIn' | 'revoked' | 'expired' | 'cancelled',

  sangUserId: string,
  sangUid: string,
  linkStatus: 'linked' | 'pending' | 'manual_review',
  linkMethod: 'verified_email' | 'verified_phone' | 'manual' | '',
  linkConflictReason: string,

  // CRM-facing Sang app match status.
  sangAppStatus: 'linked' | 'not_found' | 'missing_identity' | 'manual_review',
  sangAppLinked: boolean,
  sangAppUserId: string,
  sangAppMatchMethod: 'verified_email' | 'verified_phone' | 'manual' | '',
  sangAppConflictReason: string,
  sangAppCheckedAt: Timestamp,

  linkedAt?: Timestamp,
  accessPublishedAt?: Timestamp,
  accessLastPublishedAt?: Timestamp,
  updatedAt: Timestamp,
  createdAt: Timestamp
}
```

Why mobile should not read this directly:

- It can contain roster/admin context.
- Security should be user-centric through `users/{uid}/eventAccess`.
- The mirror is already shaped for mobile.

Status meaning for CRM developers:

- `linkStatus` is backend workflow state.
- `sangAppStatus` is the organizer-facing Sang app match state.
- `linked`: matching verified Sang account found and mirror written.
- `not_found`: email/phone exists, but no verified Sang user matched yet.
- `missing_identity`: roster row has no usable email/phone for matching.
- `manual_review`: duplicate/conflicting match needs organizer/developer review.

### `pePasses/{passId}`

Backend pass document.

Shape:

```ts
{
  orgId: string,
  programId: string,
  programPersonId: string,
  tokenHash: string,
  qrPayload: 'SANGPASS1:{token}',
  passCode: '48291370',
  status: 'issued' | 'checkedIn' | 'revoked' | 'expired' | 'cancelled',
  delivery: {
    channel: string,
    status: string
  },
  qrUpdatedAt?: Timestamp,
  qrUpdatedBy?: string,
  qrRotationCount?: number,
  createdAt: Timestamp,
  updatedAt: Timestamp,
  revokedAt?: Timestamp,
  revokedReason?: string,
  replacedByPassId?: string
}
```

Mobile rule:

- Do not read `pePasses`.
- Do not generate pass token locally.
- Render the QR from `users/{uid}/eventAccess/{programId}.passQrPayload`.
- Show `passCode` only as a human-readable support/display code.
- When CRM refreshes a QR, `passId` normally stays the same and only `passQrPayload`, `passCode`, and update timestamps change in the mirror.

### `peEventScheduleDashboard/{scheduleItemId}`

CRM editing source for schedules. One document per schedule row.

Mobile rule:

- Do not read this collection from Sang app.
- Call `getMyProgramSchedule({ programId })` instead.

### `peProgramVenues/{programId}`

CRM venue catalog. One document per program. Contains reusable venues and rooms/halls for that program.

Shape:

```ts
{
  orgId: string,
  programId: string,
  venues: [
    {
      id: string,
      name: string,
      address: string,
      latitude?: number,
      longitude?: number,
      rooms: [
        {
          id: string,
          name: string,
          floor: string,
          capacity?: number
        }
      ]
    }
  ],
  updatedAt: Timestamp
}
```

Mobile rule:

- Usually do not read this directly.
- Program/event/schedule documents already contain the venue name, room name, and coordinates needed for display.

### `peCheckIns/{checkInId}`

Created by `scanPassToken`.

Shape:

```ts
{
  orgId: string,
  programId: string,
  eventId: string, // empty for program-level gate
  programPersonId: string,
  passId: string,
  audienceRoleId: string,
  audienceRoleName: string,
  scannerSessionId: string,
  scannerUid: string,
  result: 'approved' | 'duplicate',
  createdAt: Timestamp
}
```

Mobile attendee rule:

- Do not read/write check-ins directly.
- Attendee pass status is mirrored back as `passStatus`.

### `peScannerSessions/{scannerSessionId}`

Created by `createScannerSession`. Used only for authorized scanner/staff mode.

Shape:

```ts
{
  orgId: string,
  programId: string,
  eventId: string, // empty for program gate
  gateName: string,
  scannerUid: string,
  sessionTokenHash: string,
  status: 'active' | 'closed',
  createdAt: Timestamp,
  expiresAt: Timestamp
}
```

## Cloud Functions For Mobile

Use Firebase Callable Functions in region `us-central1`.

### `claimMyEventAccess`

Purpose:

- Links the logged-in Sang user to matching CRM roster rows.
- Refreshes `users/{uid}/eventAccess/{programId}`.
- Should be called by the Sang app.

Input:

```ts
{}
```

Response:

```ts
{
  linkedCount: number,
  pendingCount: number,
  manualReviewCount: number
}
```

When to call:

- After login.
- After email verification.
- After phone verification.
- When user opens the Events tab and no events are visible.
- After receiving `event_program_access` notification if the program doc is not visible yet.

Pseudo-code:

```ts
const functions = getFunctions(app, 'us-central1')
await httpsCallable(functions, 'claimMyEventAccess')({})
```

Expected UX:

- If `linkedCount > 0`, refresh Events tab.
- If `pendingCount > 0`, show a neutral empty state like: "Your registration may still be waiting for organizer publish."
- If `manualReviewCount > 0`, show support text: "We found a matching registration but it needs organizer review."

### `getMyEventPass`

Purpose:

- Reads the user's event mirror and the current backend pass, then returns only safe pass fields to the app.
- Keeps `pePasses` as source of truth without allowing direct mobile reads.
- Refreshes `users/{uid}/eventAccess/{programId}` with the latest pass payload/code/status.

Input:

```ts
{
  programId: string
}
```

Backend checks:

- Auth uid comes from Firebase Auth, not from app input.
- `users/{uid}/eventAccess/{programId}` exists.
- Mirror contains `passId` and `programPersonId`.
- `pePasses/{passId}.programId == programId`.
- `pePasses/{passId}.programPersonId == mirror.programPersonId`.

Response:

```ts
{
  passQrPayload: 'SANGPASS1:{token}',
  passCode: '48291370',
  passStatus: 'issued',
  updatedAt: Timestamp | null
}
```

Mobile behavior:

- Render cached mirror immediately.
- Call `getMyEventPass` when the pass screen opens.
- Replace QR/status/code with the callable response when it arrives.
- Keep using scanner backend validation for actual entry approval.

### `createScannerSession`

Purpose:

- Optional staff mode.
- Creates a short-lived scanner session for a program gate or event gate.

Input:

```ts
{
  orgId: string,
  programId: string,
  eventId?: string,
  gateName?: string
}
```

Response:

```ts
{
  scannerSessionId: string,
  scannerToken: string
}
```

Notes:

- Requires CRM team permission `checkin.scan`.
- `scannerToken` is returned once. Keep it in memory or secure local storage for the active scan session.
- Session expires after 12 hours.

### `scanPassToken`

Purpose:

- Validates a pass QR and creates a check-in.

Input:

```ts
{
  scannerSessionId: string,
  scannerToken: string,
  payload: 'SANGPASS1:{token}',
  deviceScanId?: string
}
```

Response:

```ts
{
  result: 'approved' | 'duplicate',
  passId: string,
  programPersonId: string
}
```

Denied cases are returned as callable errors:

- `not-found`: pass not found.
- `permission-denied`: invalid scanner, expired scanner, revoked pass, wrong program, no event access, role not allowed.

Scanner UX:

- Green state for `approved`.
- Amber state for `duplicate`.
- Red state for callable errors.
- Use `deviceScanId` to make retries idempotent.

## QR Handling

### Attendee Entry Pass

The user's entry QR is in:

```ts
users/{uid}/eventAccess/{programId}.passQrPayload
```

Format:

```txt
SANGPASS1:{token}
```

Mobile should:

- Render this exact string as QR.
- Never show `tokenHash`.
- Never generate or mutate the QR payload locally.
- If empty, call `claimMyEventAccess`; if still empty, show "Pass is syncing" state.
- Listen to the event access document because CRM can refresh the QR in place without changing `passId`.

### Scanner

Scanner should:

- Accept only QR payloads beginning with `SANGPASS1:`.
- Pass the full payload to `scanPassToken`.
- Not parse the token beyond basic prefix validation.
- Let backend decide approved/duplicate/denied.

### Not Implemented

Do not implement these:

```txt
SANGPROGRAM1:{token}
peProgramJoinLinks
peProgramJoinRequests
joinProgramByQr
createProgramJoinLink
```

## Firestore Rules Needed In Main Sang App

The main Sang Firestore rules must allow users to read their own event mirror.

Inside existing `match /users/{uid}`:

```rules
match /eventAccess/{programId} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}
```

If mobile directly reads `pePrograms`, `peEvents`, `peProgramSchedule`, or `peProgramSchedulePages`, add mobile read helpers in the same Firestore rules file. Keep existing CRM team rules as-is and add these mobile checks as an OR condition. If mobile uses `getMyProgramSchedule`, direct schedule read rules are not required because the callable reads the published snapshot server-side.

Recommended helper:

```rules
function peMobileHasProgramAccess(programId) {
  return request.auth != null
    && exists(/databases/$(database)/documents/users/$(request.auth.uid)/eventAccess/$(programId));
}

function peMobileEventAccess(programId) {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)/eventAccess/$(programId)).data;
}

function peMobileCanReadEvent(programId, eventId) {
  return peMobileHasProgramAccess(programId)
    && peMobileEventAccess(programId).allowedEventIds is list
    && eventId in peMobileEventAccess(programId).allowedEventIds;
}
```

Recommended read rules:

```rules
match /pePrograms/{programId} {
  allow read: if existingCrmProgramReadCondition
    || peMobileHasProgramAccess(programId);
}

match /peEvents/{eventId} {
  allow read: if existingCrmEventReadCondition
    || peMobileCanReadEvent(resource.data.programId, eventId);
}

match /peProgramSchedule/{programId} {
  allow read: if existingCrmScheduleReadCondition
    || peMobileHasProgramAccess(programId);
}

match /peProgramSchedulePages/{pageId} {
  allow read: if existingCrmSchedulePageReadCondition
    || peMobileHasProgramAccess(resource.data.programId);
}
```

Security notes:

- Do not allow mobile writes to CRM collections.
- Do not allow mobile reads of `pePasses`.
- If using only the mirror and `getMyProgramSchedule`, no mobile list query on `pePrograms`, `peEvents`, `peProgramSchedule`, or `peProgramSchedulePages` is needed.

## Recommended Mobile Screen Flow

### App Startup

1. Listen to Firebase Auth state.
2. Register or refresh FCM token in `devices/{deviceId}`.
3. If logged in and verified email/phone exists, call `claimMyEventAccess`.
4. Start listener on `users/{uid}/eventAccess`.

### Events Tab

Data:

```ts
users/{uid}/eventAccess/*
```

UI:

- Program card: poster/banner, program name, date range, venue, user's role.
- Status chip: Live, Upcoming, Past, Checked in.
- Empty state: "No event access yet" with a refresh/sync action.

### Program Detail

Data:

```ts
users/{uid}/eventAccess/{programId}
```

UI:

- Banner/poster.
- About section from `description`.
- Venue and map link from `venueName`, `address`, `latitude`, `longitude`.
- Entry pass button.
- Event list from `eventAccessList`.

### Event Detail

Data options:

- Minimum: selected item from `eventAccessList`.
- Better: also read `peEvents/{eventId}` if rules are added.
- Schedule: call `getMyProgramSchedule({ programId })` and filter/group by `eventId` in the app UI when showing a single event.

UI:

- Event name, role, status.
- Schedule list.
- Speakers/profiles if using `peEvents.profiles`.
- Poster if using `peEvents.posterUrl`.

### Entry Pass

Data:

```ts
users/{uid}/eventAccess/{programId}.passQrPayload
```

UI:

- QR code.
- Program name.
- Person name.
- Role.
- Pass status.
- Last synced timestamp.

Behavior:

- If `passStatus == checkedIn`, show checked-in state but keep QR visible if organizer may allow re-entry.
- If `passStatus` is revoked/expired/cancelled, disable QR and show contact organizer message.

### Scanner Mode

Use only for logged-in CRM team members who have scanner access.

Flow:

1. User selects program/event gate.
2. App calls `createScannerSession`.
3. Camera scans QR.
4. App calls `scanPassToken`.
5. Show approved/duplicate/denied result.

## Offline And Cache Strategy

Use Firestore offline persistence/local cache for:

- `users/{uid}/eventAccess/*`
- the latest `getMyProgramSchedule` response in app/local storage

Recommended behavior:

- Show cached program and schedule immediately.
- Display a subtle "Last synced" timestamp using `updatedAt`.
- For pass QR, cached `passQrPayload` is acceptable, but scanner backend still validates latest pass status.
- If network is offline, scanner should queue nothing by default unless an explicit offline scanning product decision is made. Offline scan approval is risky because revoked passes cannot be checked.

## Date/Time Handling

Backend stores these as Firestore `Timestamp`:

- `users/{uid}/eventAccess/{programId}.startDate`
- `users/{uid}/eventAccess/{programId}.endDate`
- `users/{uid}/eventAccess/{programId}.nextScheduleAt`
- `peEvents.startDateTime`
- `peEvents.endDateTime`
- `peEvents.nextScheduleAt`
- `getMyProgramSchedule().items[].startsAt`
- `getMyProgramSchedule().items[].endsAt`
- All `createdAt`, `updatedAt`, `linkedAt`, `accessPublishedAt`, `expiresAt`

Mobile should:

- Convert Timestamp to native Date/DateTime.
- Display times in the document's `timezone`, default `Asia/Kolkata`.
- Do not expect ISO string dates from Firestore.

## Error And Edge Case Handling

### User registered but program not visible

Possible reasons:

- Organizer has not published roster.
- User email/phone is not verified.
- CRM roster email/phone does not match Sang account.
- Duplicate CRM rows matched the same user and need manual review.

Mobile action:

- Call `claimMyEventAccess`.
- If still empty, show support path.

### Pass QR missing

Possible reasons:

- Person was linked before pass was issued.
- Mirror is stale.

Mobile action:

- Call `claimMyEventAccess`.
- If still empty, show "Pass is syncing" state.

### Event schedule empty

Possible reasons:

- CRM has not added schedule items.
- Organizer has not clicked "Publish schedule" after editing.
- Schedule item visibility is `staffOnly`.
- User role does not match a role-based schedule row.
- User does not have that event in `allowedEventIds` when the UI filters to one event.

### Check-in denied

Possible reasons:

- Pass is revoked/expired/cancelled.
- Scanner session expired.
- Scanner selected wrong program/event.
- Person does not have access to the event.
- Person's event role is not in `peEvents.allowedAudienceRoleIds`.

## Developer Implementation Checklist

Before coding:

- Confirm Firebase project is `sang-d8b93`.
- Confirm callable region is `us-central1`.
- Confirm Firestore rules include `users/{uid}/eventAccess`.
- Confirm mobile uses `getMyProgramSchedule` for schedule loading.
- Confirm app writes `users/{uid}.verifiedEmail` or `verifiedPhone` after verification.
- Confirm app writes FCM tokens to `devices`.

Mobile implementation:

- Add Events tab.
- Add `claimMyEventAccess` function call after auth/verification.
- Add listener for `users/{uid}/eventAccess`.
- Build program card UI from mirror fields.
- Build event list from `eventAccessList`.
- Call `getMyProgramSchedule({ programId })` for schedules.
- Render QR from `passQrPayload`.
- Handle FCM `event_program_access` deep link.
- Add empty, loading, sync, and error states.
- Add optional scanner mode only for authorized staff.

Backend/deployment verification:

- Deploy updated Event CRM functions after `passQrPayload` mirror changes.
- Publish a test roster from CRM.
- Verify `peProgramPeople.linkStatus == linked`.
- Verify `users/{uid}/eventAccess/{programId}` exists.
- Verify `passQrPayload` is present in the mirror.
- Verify schedule appears from `getMyProgramSchedule({ programId })` after organizer clicks "Publish schedule".
- Verify pass QR scans through `scanPassToken`.

## Minimal Mobile Pseudo-Code

```ts
import {
  getFirestore,
  collection,
  onSnapshot
} from 'firebase/firestore'
import {
  getFunctions,
  httpsCallable
} from 'firebase/functions'

const db = getFirestore()
const functions = getFunctions(undefined, 'us-central1')

async function syncEventAccess() {
  await httpsCallable(functions, 'claimMyEventAccess')({})
}

function listenToMyPrograms(uid, onPrograms) {
  return onSnapshot(
    collection(db, 'users', uid, 'eventAccess'),
    (snapshot) => {
      const programs = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data()
      }))
      onPrograms(programs)
    }
  )
}

async function getMySchedule(programId) {
  const result = await httpsCallable(functions, 'getMyProgramSchedule')({
    programId
  })
  return result.data
}

async function startScannerSession({ orgId, programId, eventId, gateName }) {
  const result = await httpsCallable(functions, 'createScannerSession')({
    orgId,
    programId,
    eventId,
    gateName
  })
  return result.data
}

async function scanPass({ scannerSessionId, scannerToken, qrPayload, deviceScanId }) {
  const result = await httpsCallable(functions, 'scanPassToken')({
    scannerSessionId,
    scannerToken,
    payload: qrPayload,
    deviceScanId
  })
  return result.data
}
```

## What Not To Do

- Do not read all `pePrograms` to find user events.
- Do not query all `peProgramPeople` from mobile.
- Do not read `pePasses` from mobile.
- Do not create check-in documents directly from mobile.
- Do not validate pass QR locally.
- Do not implement program QR join.
- Do not store schedule dates as strings in new mobile writes.
- Do not show CRM-only language to attendees.

## Open Product Gaps To Decide Before Mobile Release

1. Event detail reads: decide whether mobile needs direct `peEvents/{eventId}` or whether mirror plus schedule is enough for first release.
2. Results/competition module: currently not part of mobile event access contract.
3. Offline scanner mode: not recommended for first release because revoked passes and duplicate scans require server validation.
4. Rich text rendering: `description` may contain formatted content from CRM; mobile should render sanitized rich text or HTML safely.
