# Sang Event CRM Firestore Data Structure And Developer Handoff

Date: 2026-08-08  
Repo: `thesangapp-glitch/cms-software`  
Firebase project: `sang-d8b93`  
Hosting: `https://sang-event-crm.web.app`  
Functions region: `us-central1`  
CRM functions codebase: `eventcrm`

This document explains how the Sang Event CRM database works today, which collections exist, what each document stores, how data flows through onboarding/program/event/pass/check-in, and what a developer must check before making the next changes.

## Golden Rules

1. CRM code lives in this repo, but Firestore rules/indexes are project-wide.
2. Do not deploy Firestore rules directly from `sang_event_crm`; deploy merged rules from the main Sang repo:
   - `C:\Users\Admin\Documents\sang\firestore.rules`
   - `C:\Users\Admin\Documents\sang\firestore.indexes.json`
   - `C:\Users\Admin\Documents\sang\storage.rules`
3. All event CRM top-level collections use the `pe` prefix, meaning "program/event".
4. Every operational document must carry `orgId`.
5. Every program-scoped document must carry both `orgId` and `programId`.
6. Every event-scoped document must carry `orgId`, `programId`, and `eventId`.
7. Events are stored top-level in `peEvents`, but an event is never valid without a program. Cloud Functions must enforce this.
8. Secure QR tokens must never be stored raw, except where the current UI temporarily shows a payload. Passes and join links store `tokenHash`.
9. Prefer Cloud Functions for writes that issue credentials, create passes, create scan sessions, perform check-ins, update protected state, or write audit logs.
10. Before adding a field, decide whether it belongs to organization, program, event, person, pass, schedule, entry, analytics, or audit.

## Current High-Level Model

The CRM has two sides:

- Organizer side: CRM users who create organizations, programs, events, roles, team members, people lists, passes, check-ins, and analytics.
- Attendee/participant side: people who attend/participate in a program or event. Some are Sang mobile app users, some are not.

Current selected workspace flow:

1. Firebase Auth user logs in.
2. CRM reads `peUsers/{uid}`.
3. If no user profile exists, the app runs `claimTeamAccess`.
4. If no organization exists, onboarding creates one through `createOrganization`.
5. If user has multiple organizations, user chooses one. `setActiveOrganization` stores `activeOrgId`.
6. App loads active organization data and all program/event/people/pass/check-in data for that organization.
7. If multiple programs exist, user chooses a program workspace.
8. Dashboard, Events, People, Check-in, Analytics, and Settings work in selected organization plus selected program context.

## Implemented Collections

### `peUsers/{uid}`

Purpose: CRM profile for a Firebase Auth user. This is not the same as a Sang mobile public profile. It stores CRM workspace membership summary and active organization.

Document id:

- Firebase Auth `uid`

Main fields:

```ts
{
  uid: string,
  displayName: string,
  email: string,
  activeOrgId?: string,
  organizationIds: string[],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created/updated by:

- `createOrganization`
- `claimTeamAccess`
- `setActiveOrganization`
- Client may read/update only its own profile as allowed by rules.

Important behavior:

- `organizationIds` is used to detect if the CRM user can access multiple organizations.
- `activeOrgId` decides which organization dashboard opens.
- If invited by email, `claimTeamAccess` links invited team member rows to this user after login.

Before changing:

- Do not store role permissions here. Permissions are resolved from `peTeamMembers` plus organization role docs.
- Do not use this as attendee/participant list. Attendees are in `peProgramPeople`.

### `peOrganizations/{orgId}`

Purpose: top-level workspace owned by an organizer/company/institute/event agency.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  name: string,
  industry: string,
  website: string,
  logoUrl: string,
  ownerUid: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created/updated by:

- `createOrganization`
- `updateOrganization`

Rules:

- Read: active organization member.
- Create: authenticated owner.
- Update: member with `team.write`.
- Delete: not allowed.

Important behavior:

- Organization is the root business account.
- Programs live top-level in `pePrograms`, but every program points to `orgId`.
- Roles are subcollection docs under this organization.

Before changing:

- Keep organization data generic. Do not store one event-specific branding at organization level unless it belongs to the organizer brand.
- Use `logoUrl` for organization identity. Use program/event image fields for event-specific artwork.

### `peOrganizations/{orgId}/roles/{roleId}`

Purpose: role definitions and permission sets for an organization.

Document id:

- Default ids: `owner`, `event-lead`, `gate-staff`, `analyst`
- Custom role ids are created by role editor.

Main fields:

```ts
{
  orgId: string,
  name: string,
  description: string,
  permissions: string[],
  isDefault: boolean,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Current permission keys:

```ts
[
  "roles.write",
  "team.write",
  "program.read",
  "program.write",
  "event.write",
  "people.import",
  "passes.issue",
  "checkin.scan",
  "analytics.read",
  "exports.create",
  "*"
]
```

Created/updated by:

- `createOrganization` creates default roles.
- `createRole` creates/updates custom roles.

Rules:

- Read: active member.
- Create/update/delete: `roles.write`.

Before changing:

- New sensitive screens must map to explicit permission keys.
- Do not hard-code role names in UI logic. Use permissions.

### `peTeamMembers/{teamMemberId}`

Purpose: organizer-side CRM access assignment. This is "table ke organizer side" users.

Document ids:

- Owner active member: `${orgId}_${uid}`
- Claimed invite active member: `${orgId}_${uid}`
- Pending invite: auto-generated id

Main fields:

```ts
{
  orgId: string,
  email: string,
  displayName: string,
  roleId: string,
  scope: "organization" | "program" | "event",
  programId?: string,
  eventId?: string,
  status: "active" | "invited" | "claimed",
  uid?: string,
  claimedUid?: string,
  claimedFromTeamMemberId?: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created/updated by:

- `createOrganization`
- `inviteTeamMember`
- `claimTeamAccess`

Rules:

- Read: active member of same org, or the user reading their own row by `uid`.
- Create/update: `team.write`.
- Delete: not allowed.

Important behavior:

- Permission checks in Cloud Functions query `peTeamMembers` where `orgId`, `uid`, and `status == active`.
- Then function reads `peOrganizations/{orgId}/roles/{roleId}`.
- Invites are email-first. When user logs in with the invited email, `claimTeamAccess` makes an active member row.

Before changing:

- Be careful with duplicate active rows for same `orgId + uid`.
- If adding phone-based access, normalize phone and add equivalent claim flow.
- Scope exists but currently permission enforcement is mostly org-level; future work should enforce scope for program/event-specific access.

### `pePrograms/{programId}`

Purpose: top-level program/fest/conference/corporate event/workspace under an organization.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  name: string,
  mode: "standalone" | "multiEvent",
  programType: string,
  startDate: string,
  endDate: string,
  venueName: string,
  city: string,
  logoUrl: string,
  bannerUrl: string,
  posterUrl: string,
  latitude?: number,
  longitude?: number,
  address: string,
  timezone: string,
  description: string,
  entryScope: "program" | "event" | "both",
  competitive: boolean,
  resultsEnabled: boolean,
  joinQrEnabled: boolean,
  status: "draft" | "live" | "archived",
  archivedAt?: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Current `programType` options in UI:

```ts
[
  "college_fest",
  "conference",
  "corporate_event",
  "competition",
  "workshop_series",
  "exhibition",
  "community_event",
  "custom"
]
```

Created/updated by:

- `createProgram`
- `updateProgram`
- `deleteProgram` archives the program, it does not hard-delete.

Rules:

- Read: active member.
- Create/update: `program.write`.
- Delete: not allowed.

Important behavior:

- Dashboard is selected-program based.
- `mode == standalone` means the program itself can behave like the primary event.
- `mode == multiEvent` means program contains multiple child events in `peEvents`.
- `entryScope` controls whether entry pass should work at program gate, event gate, or both.
- `competitive/resultsEnabled` are program-level controls; event-level result flag is relevant only if program supports competition/results.

Before changing:

- Do not nest events under program unless you migrate all queries/rules/functions. Current decision is top-level `peEvents` with required `programId`.
- Do not hard-delete programs unless you design cascade/archive behavior for events, people, passes, check-ins, schedules, analytics, and audit logs.

### `peProgramContent/{programId}`

Purpose: flexible program content shell for schedule/info/form sections.

Document id:

- Same as `programId`

Main fields:

```ts
{
  orgId: string,
  programId: string,
  schedule: unknown[],
  infoSections: unknown[],
  fieldDefinitions: unknown[],
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created by:

- `createProgram`

Rules:

- Read: active member.
- Create/update: `program.write`.
- Delete: not allowed.

Important behavior:

- Current detailed event schedule moved to `peEventScheduleItems`.
- Treat this as lightweight program content/config only.

Before changing:

- Do not store huge schedules here.
- For detailed schedule items, use `peEventScheduleItems`.

### `peProgramContentSections/{sectionId}`

Purpose: planned/partial support for independently editable content sections.

Main fields should include:

```ts
{
  orgId: string,
  programId: string,
  sectionType: string,
  title: string,
  content: unknown,
  sortOrder: number,
  visibility: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Rules exist:

- Read: active member.
- Create/update: `program.write`.
- Delete: not allowed.

Implementation status:

- Rules exist.
- Current main UI does not heavily use this yet.

### `peEvents/{eventId}`

Purpose: individual event/sub-event/session/workshop/competition/gate zone inside a program.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  programId: string,
  name: string,
  eventType: string,
  startDateTime: string,
  endDateTime: string,
  multiDate: boolean,
  venueName: string,
  locationNote: string,
  posterUrl: string,
  latitude?: number,
  longitude?: number,
  address: string,
  entryScope: "program" | "event" | "both",
  competitive: boolean,
  resultsEnabled: boolean,
  scheduleItemCount: number,
  nextScheduleTitle: string,
  nextScheduleAt: string,
  status: "draft" | "live" | "completed",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Current `eventType` options in UI:

```ts
[
  "session",
  "workshop",
  "competition",
  "presentation",
  "poster_session",
  "performance",
  "exhibition",
  "gate_zone",
  "custom"
]
```

Created/updated by:

- `createEvent`
- `updateEvent`
- `deleteEvent` currently hard-deletes an event document.

Rules:

- Read: active member.
- Create/update: `event.write`.
- Delete: client delete not allowed; function handles delete.

Important behavior:

- `createEvent` validates that `programId` exists and belongs to `orgId`.
- `updateEvent` validates that event belongs to program and org.
- Schedule summary fields are stored here for fast event list/card rendering.
- Detailed schedule lives in `peEventScheduleItems`.

Before changing:

- If delete behavior is changed, consider soft-delete instead of hard-delete because schedule items, people assignments, check-ins, and analytics can point to event ids.
- If adding multi-day schedule, keep item-level times in `peEventScheduleItems`.

### `peEventScheduleItems/{scheduleItemId}`

Purpose: detailed source of truth for event schedule items: rounds, sessions, check-in slots, breaks, result announcements, etc.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  programId: string,
  eventId: string, // currently empty string allowed for program-level future use
  title: string,
  type: "session" | "round" | "break" | "checkin" | "performance" | "result" | "ceremony" | "custom",
  description: string,
  startsAt: string,
  endsAt: string,
  timezone: string,
  venueName: string,
  roomName: string,
  latitude?: number,
  longitude?: number,
  visibility: "public" | "staffOnly" | "participantsOnly",
  status: "draft" | "scheduled" | "delayed" | "cancelled" | "completed",
  sortOrder: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created/updated by:

- `createScheduleItem`
- `updateScheduleItem`
- `deleteScheduleItem`

Rules:

- Read: active member.
- Write: false from client. Use Cloud Functions.

Important behavior:

- On create with `eventId`, function increments `peEvents/{eventId}.scheduleItemCount`.
- It also updates `nextScheduleTitle` and `nextScheduleAt`.
- This avoids large arrays inside event docs and keeps read costs controllable.

Before changing:

- Recalculate `nextScheduleTitle/nextScheduleAt` correctly after schedule update/delete. Current create path updates summary; robust recomputation is still a next task.
- Add assigned staff if schedule item ownership is required.
- Add reorder logic carefully; do not overwrite unrelated items.

### `peProgramJoinLinks/{joinLinkId}`

Purpose: secure program Scan-to-Join QR links for Sang mobile users.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  programId: string,
  mode: "direct_join" | "request_approval" | "invite_only",
  allowedCategory: "attendee" | "participant" | "speaker" | "staff" | "custom",
  allowedEventIds: string[],
  maxUses: number,
  expiresAt: string,
  campaignName: string,
  tokenHash: string,
  usedCount: number,
  status: "active" | "revoked" | "expired",
  qrPayload: string, // current payload: SANGPROGRAM1:{token}
  createdBy: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created by:

- `createProgramJoinLink`

Rules:

- Read: active member.
- Write: false from client. Use Cloud Functions.

Important behavior:

- Raw token is generated in function.
- `tokenHash` is stored for lookup.
- QR payload is returned to UI and currently stored as `qrPayload`.

Security note:

- Long-term best practice: do not store raw `qrPayload` if it contains raw token. Store only hash and display QR from create response, or encrypt/store securely if organizer needs regeneration.

Before changing:

- Implement `joinProgramByQr` before Sang app uses QR in production.
- It must validate token hash, status, expiry, max uses, duplicate joins, join mode, allowed category, and allowed events.
- It must update or create `peProgramPeople` safely.

### `peProgramPeople/{programPersonId}`

Purpose: attendee/participant/speaker/staff list for a program. This is "table ke attendee/participant side" users.

Document id:

- Auto-generated Firestore id

Main fields currently written:

```ts
{
  orgId: string,
  programId: string,
  fullName: string,
  email: string,
  phone: string,
  kind: "attendee" | "participant" | "speaker" | "staff",
  company: string,
  designation: string,
  passId: string,
  passStatus: "issued" | "checkedIn",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Recommended linking fields for next implementation:

```ts
{
  normalizedEmail?: string,
  normalizedPhone?: string,
  sangUserId?: string,
  linkStatus?: "linked" | "pending" | "conflict" | "manual_review",
  linkMethod?: "email" | "phone" | "manual" | "qr_join",
  linkedAt?: Timestamp,
  linkConflictReason?: string,
  source?: "manual" | "csv_import" | "program_join_qr" | "api"
}
```

Created/updated by:

- `createProgramPersonAndPass`
- `issuePassForProgramPerson`
- CSV import UI loops through rows and calls create flow.
- `scanPassToken` updates `passStatus` to `checkedIn`.

Rules:

- Read: active member.
- Create: `people.import`.
- Update: `people.import` or `passes.issue`.
- Delete: not allowed.

Important behavior:

- Every uploaded attendee/participant should have a row here, whether they are Sang users or not.
- If a person is already a Sang user, link using `sangUserId`; do not skip CRM record.
- If person is not a Sang user yet, keep row pending and link later when they sign up or scan/join.

Before changing:

- Do not replace this collection with Sang app `users`; CRM event registration must preserve event-specific metadata.
- Add dedupe rules before bulk import: likely unique key `programId + normalizedEmail` or `programId + normalizedPhone`.
- Add import status/errors instead of silently failing row uploads.

### `peProgramPeople/{programPersonId}/events/{eventId}`

Purpose: event-level assignment for a program person.

Document id:

- `eventId`

Main fields:

```ts
{
  orgId: string,
  programId: string,
  eventId: string,
  status: "registered" | "checked_in" | "waiting" | "next" | "presenting" | "completed" | "absent" | "disqualified",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created by:

- `createProgramPersonAndPass` when event ids are passed.

Rules:

- Read: active member.
- Create/update: `people.import`.
- Delete: not allowed.

Important behavior:

- This supports cases where one program has many events and a person is assigned only to some events.
- Current UI assigns event access during people add/import.

Before changing:

- If adding event-level check-in, update this subdoc status as well as pass/check-in docs.

### `pePasses/{passId}`

Purpose: secure credential/pass for a program person.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  programId: string,
  programPersonId: string,
  tokenHash: string,
  qrPayload: string, // SANGPASS1:{token}
  status: "issued" | "checkedIn" | "revoked",
  delivery: {
    channel: "manual" | "email" | "sms" | "app",
    status: "notSent" | "sent" | "failed"
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created by:

- `createProgramPersonAndPass`
- `issuePassForProgramPerson`

Updated by:

- `scanPassToken`

Rules:

- Read: active member.
- Write: false from client. Use Cloud Functions.

Important behavior:

- QR payload format: `SANGPASS1:{token}`.
- Scanner submits payload; backend hashes token and searches `pePasses.tokenHash`.
- Check-in is approved only if pass belongs to scanner session's org/program.

Security note:

- Current pass docs include `qrPayload`. Long-term, avoid storing raw token payload. Store `tokenHash` only and deliver/display raw token at creation time or through a controlled delivery mechanism.

Before changing:

- Do not expose token hash or raw token to public web.
- For event-level gate logic, compare event assignment and `entryScope`.

### `peScannerSessions/{scannerSessionId}`

Purpose: temporary authorized scanner session for gate staff.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  programId: string,
  eventId: string,
  gateName: string,
  scannerUid: string,
  sessionTokenHash: string,
  status: "active" | "closed" | "expired",
  createdAt: Timestamp,
  expiresAt: Timestamp
}
```

Created by:

- `createScannerSession`

Rules:

- Read: only the scanner user.
- Write: false from client.

Important behavior:

- Function returns raw `scannerToken` once.
- Scan requests must include `scannerSessionId` and `scannerToken`.

Before changing:

- Expiry should be actively enforced in scan function. Current field exists; robust expiry check should be added.
- Add close session function if gate staff need to end sessions.

### `peCheckIns/{checkInId}`

Purpose: immutable-ish check-in activity records.

Document id:

- `deviceScanId` if provided, otherwise auto-generated id

Main fields:

```ts
{
  orgId: string,
  programId: string,
  eventId: string,
  programPersonId: string,
  passId: string,
  scannerSessionId: string,
  scannerUid: string,
  result: "approved" | "duplicate" | "rejected",
  createdAt: Timestamp
}
```

Created by:

- `scanPassToken`

Rules:

- Read: active member.
- Write: false from client.

Important behavior:

- If `deviceScanId` is reused, scan function returns existing result. This gives basic idempotency.
- First approved scan updates `pePasses.status` and `peProgramPeople.passStatus` to `checkedIn`.
- Duplicate scans create/return duplicate state.

Before changing:

- Do not store check-ins as a rolling array inside one user document. Firestore document size and concurrent writes will break at scale.
- Add undo/reversal as a separate action record or status update with audit trail.

### `peImports/{importId}`

Purpose: import history for CSV uploads.

Main fields currently written by UI:

```ts
{
  orgId: string,
  programId: string,
  fileName: string,
  rowCount: number,
  successCount: number,
  errorCount: number,
  errors: string[],
  createdBy: string,
  createdAt: Timestamp
}
```

Rules:

- Read: active member.
- Create: `people.import`.
- Update/delete: false.

Important behavior:

- Current CSV import creates records client-side after looped callable creates people/passes.

Before changing:

- For large imports, move parsing/import into backend job and store row-level errors.

### `peExports/{exportId}`

Purpose: planned export job tracking.

Current status:

- Rules/index exist.
- Large async export job is pending.
- Current UI has direct CSV downloads for smaller roster/analytics exports.

Recommended fields:

```ts
{
  orgId: string,
  programId: string,
  type: "people" | "passes" | "checkins" | "analytics",
  status: "queued" | "running" | "completed" | "failed",
  downloadUrl?: string,
  requestedBy: string,
  createdAt: Timestamp,
  completedAt?: Timestamp,
  error?: string
}
```

Rules:

- Read: active member.
- Write: false from client.

### `peAnalyticsSummaries/{summaryId}`

Purpose: precomputed analytics summaries.

Current status:

- Rules exist.
- Current UI mostly computes analytics from loaded programs/events/people/passes/check-ins.
- Backend summary generation is pending.

Recommended id patterns:

- `org_{orgId}`
- `program_{programId}`
- `event_{eventId}`
- `program_{programId}_day_{yyyyMMdd}`

Recommended fields:

```ts
{
  orgId: string,
  programId?: string,
  eventId?: string,
  scope: "organization" | "program" | "event",
  totals: {
    people: number,
    attendees: number,
    participants: number,
    passesIssued: number,
    checkedIn: number,
    connections?: number
  },
  updatedAt: Timestamp
}
```

Rules:

- Read: active member.
- Write: false from client.

### `peAnalyticsBuckets/{bucketId}`

Purpose: time-bucketed analytics for charts.

Current status:

- Rules exist.
- Generation is pending.

Recommended fields:

```ts
{
  orgId: string,
  programId?: string,
  eventId?: string,
  metric: string,
  bucketType: "hour" | "day" | "event",
  bucketStart: Timestamp,
  value: number,
  updatedAt: Timestamp
}
```

### `peAuditLogs/{logId}`

Purpose: audit trail for sensitive organizer actions.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  actorUid: string,
  action: string,
  entityPath: string,
  metadata?: Record<string, unknown>,
  createdAt: Timestamp
}
```

Written by helper:

- `writeAudit`

Current actions include:

```ts
[
  "organization.create",
  "organization.update",
  "role.upsert",
  "team.invite",
  "program.create",
  "program.update",
  "program.archive",
  "event.create",
  "event.update",
  "event.delete",
  "schedule.create",
  "schedule.update",
  "schedule.delete",
  "programJoinLink.create",
  "programPerson.createWithPass",
  "pass.issue"
]
```

Rules:

- Read: `analytics.read`.
- Write: false from client.

Before changing:

- Every sensitive function should call `writeAudit`.
- Do not allow client audit writes.

### `peTeams/{teamId}`

Purpose: planned/team or participant-team data.

Current status:

- Rules exist.
- Main team-member access uses `peTeamMembers`.
- Competition/team participant model is still pending.

Recommended future use:

```ts
{
  orgId: string,
  programId: string,
  eventId?: string,
  name: string,
  code?: string,
  memberProgramPersonIds: string[],
  status: string,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Important:

- Do not confuse this with `peTeamMembers`. `peTeamMembers` are CRM operators; `peTeams` should be participant teams.

## User-Side Nested Collection In Main Sang Rules

The CRM rules partial mentions a nested block under the existing Sang mobile `users/{uid}` rule:

```rules
match /eventAccess/{programId} {
  allow read: if request.auth != null && request.auth.uid == uid;
  allow write: if false;
}
```

Purpose:

- Future Sang mobile app can read event/program access summary under its own user document.

Current status:

- Planned integration point.
- Main CRM currently uses `peProgramPeople.sangUserId` plan, but linking is not fully implemented yet.

## Storage Structure

CRM image uploads go to Firebase Storage paths like:

```txt
event-crm/users/{uid}/organization-logos/{timestamp}-{fileName}
event-crm/users/{uid}/program-logos/{timestamp}-{fileName}
event-crm/users/{uid}/program-banners/{timestamp}-{fileName}
event-crm/users/{uid}/program-posters/{timestamp}-{fileName}
event-crm/users/{uid}/event-posters/{timestamp}-{fileName}
```

Stored Firestore fields:

- `peOrganizations.logoUrl`
- `pePrograms.logoUrl`
- `pePrograms.bannerUrl`
- `pePrograms.posterUrl`
- `peEvents.posterUrl`

Before changing:

- Keep uploads image-only.
- Do not ask organizer for image URL in the primary UX.
- If delete/replace image is added, decide whether old Storage files should be deleted or retained.

## Cloud Functions And Data Writes

### Organization/Auth

`createOrganization`

- Creates `peOrganizations/{orgId}`.
- Creates default roles under `peOrganizations/{orgId}/roles`.
- Creates active owner row `peTeamMembers/{orgId}_{uid}`.
- Creates/sets `peUsers/{uid}`.
- Writes audit log.

`updateOrganization`

- Updates organization profile fields.
- Requires `team.write`.
- Writes audit log.

`setActiveOrganization`

- Sets `peUsers/{uid}.activeOrgId`.
- Requires `program.read` in target org.

`claimTeamAccess`

- Finds invited `peTeamMembers` rows by normalized email.
- Creates active `peTeamMembers/{orgId}_{uid}` row.
- Marks invite row as `claimed`.
- Updates/creates `peUsers/{uid}`.

### Roles/Team

`createRole`

- Upserts role doc under organization.
- Requires `roles.write`.
- Writes audit log.

`inviteTeamMember`

- Creates invited team member row.
- Requires `team.write`.
- Writes audit log.

### Programs/Events

`createProgram`

- Creates `pePrograms/{programId}`.
- Creates `peProgramContent/{programId}`.
- Requires `program.write`.
- Writes audit log.

`updateProgram`

- Updates selected program.
- Validates program belongs to org.
- Requires `program.write`.
- Writes audit log.

`deleteProgram`

- Soft-archives program by setting `status: archived`.
- Requires `program.write`.
- Writes audit log.

`createEvent`

- Creates `peEvents/{eventId}`.
- Validates parent program.
- Requires `event.write`.
- Writes audit log.

`updateEvent`

- Updates event.
- Validates event belongs to org and program.
- Requires `event.write`.
- Writes audit log.

`deleteEvent`

- Hard-deletes event doc currently.
- Requires `event.write`.
- Writes audit log.

### Schedule

`createScheduleItem`

- Creates `peEventScheduleItems/{scheduleItemId}`.
- Validates program and optional event.
- Requires `event.write`.
- Updates event schedule summary if `eventId` exists.
- Writes audit log.

`updateScheduleItem`

- Updates schedule item.
- Requires `event.write`.
- Writes audit log.

`deleteScheduleItem`

- Deletes schedule item.
- Requires `event.write`.
- Writes audit log.

### Program Join QR

`createProgramJoinLink`

- Creates `peProgramJoinLinks/{joinLinkId}`.
- Stores `tokenHash`.
- Returns `qrPayload: SANGPROGRAM1:{token}`.
- Requires `program.write`.
- Writes audit log.

Pending:

- `joinProgramByQr`
- approval queue
- revoke/edit join links
- join analytics

### People/Passes/Check-In

`createProgramPersonAndPass`

- Creates `peProgramPeople/{programPersonId}`.
- Creates event assignment subdocs.
- Creates `pePasses/{passId}`.
- Returns `qrPayload: SANGPASS1:{token}`.
- Requires both `people.import` and `passes.issue`.
- Writes audit log.

`issuePassForProgramPerson`

- Creates new pass for an existing program person.
- Updates person `passId/passStatus`.
- Requires `passes.issue`.
- Writes audit log.

`createScannerSession`

- Creates `peScannerSessions/{scannerSessionId}`.
- Returns raw scanner token once.
- Requires `checkin.scan`.

`scanPassToken`

- Validates scanner session and scanner token.
- Hashes pass token from QR payload.
- Finds `pePasses` by `tokenHash`.
- Creates `peCheckIns/{checkInId}`.
- Updates pass/person status on approved scan.
- Handles `deviceScanId` idempotency.

## Firestore Indexes

Current CRM index definitions:

```txt
peTeamMembers: orgId ASC, uid ASC, status ASC
peTeamMembers: email ASC, status ASC
pePrograms: orgId ASC, startDate ASC
peEvents: programId ASC, startDateTime ASC
peEventScheduleItems: programId ASC, startsAt ASC
peProgramJoinLinks: programId ASC, status ASC
peProgramPeople: programId ASC, kind ASC
peProgramPeople: orgId ASC, email ASC
pePasses: tokenHash ASC, status ASC
peCheckIns: programId ASC, createdAt DESC
peScannerSessions: scannerUid ASC, status ASC, expiresAt ASC
peExports: orgId ASC, createdAt DESC
```

Before adding queries:

- Check if the query already has a matching index.
- Any query with multiple `where` plus `orderBy` may need a new index.
- Update both CRM partial index file and main Sang project index file before deploy.

## Firestore Read Model In Frontend

`useCrmData` currently listens by active `orgId`:

```ts
peOrganizations/{orgId}
pePrograms where orgId == activeOrgId
peEvents where orgId == activeOrgId
peEventScheduleItems where orgId == activeOrgId
peProgramJoinLinks where orgId == activeOrgId
peProgramPeople where orgId == activeOrgId
pePasses where orgId == activeOrgId
peCheckIns where orgId == activeOrgId
peTeamMembers where orgId == activeOrgId
peOrganizations/{orgId}/roles
```

Important:

- This is simple and good for MVP.
- For very large events, move to route-level lazy queries:
  - Dashboard: summaries only.
  - Events route: selected program events.
  - Schedule route: selected event schedule only.
  - People route: paginated people.
  - Check-ins route: recent/paginated check-ins.

## Main Data Flows

### New Organizer Creates Account

1. Firebase Auth account created.
2. If display name exists, onboarding does not ask name again.
3. User enters organization details and uploads logo.
4. `createOrganization` creates:
   - `peOrganizations/{orgId}`
   - default roles
   - `peTeamMembers/{orgId}_{uid}`
   - `peUsers/{uid}`
   - audit log
5. CRM opens organization workspace.

### Organizer Creates Program

1. User chooses program type/mode/dates/location/assets/entry scope.
2. UI uploads images to Storage and receives download URLs.
3. `createProgram` creates:
   - `pePrograms/{programId}`
   - `peProgramContent/{programId}`
   - audit log
4. Program appears in chooser/dashboard.

### Organizer Creates Event

1. User selects program.
2. User adds event name/type/date/time/location/poster/entry/result settings.
3. `createEvent` validates parent program and creates `peEvents/{eventId}`.
4. Event appears in selected program's events list.

### Organizer Adds Schedule

1. User opens event detail.
2. User creates schedule item.
3. `createScheduleItem` creates `peEventScheduleItems/{scheduleItemId}`.
4. Function updates event summary fields.

### Organizer Imports People

1. User uploads CSV.
2. UI parses rows.
3. For each row, UI calls `createProgramPersonAndPass`.
4. Function creates:
   - `peProgramPeople/{programPersonId}`
   - event assignment subdocs if event ids provided
   - `pePasses/{passId}`
5. UI creates `peImports/{importId}` with import summary.

### Gate Check-In

1. Staff creates scanner session through `createScannerSession`.
2. Scanner receives `scannerSessionId` and `scannerToken`.
3. Staff scans pass QR payload `SANGPASS1:{token}`.
4. `scanPassToken` validates scanner session.
5. Function hashes token and finds pass by `tokenHash`.
6. Function creates `peCheckIns/{checkInId}`.
7. If first valid scan, pass/person become checked in.

### Program Join QR

Current implemented:

1. Organizer opens Settings.
2. Organizer creates program join QR.
3. `createProgramJoinLink` creates `peProgramJoinLinks/{joinLinkId}`.
4. UI displays `SANGPROGRAM1:{token}` QR.

Pending:

1. Sang mobile scans QR.
2. App calls `joinProgramByQr`.
3. Function validates token/status/expiry/limits/mode.
4. Function creates or updates `peProgramPeople`.
5. If request mode, organizer approval queue handles approval/rejection.

## Planned Collections Not Implemented Yet

These are important for the next developer, but they are not fully implemented in current code.

### `peEventEntries/{entryId}`

Purpose: poster presentations, papers, teams, startup pitches, performances, judging queues, and participant progress.

Recommended fields:

```ts
{
  orgId: string,
  programId: string,
  eventId: string,
  scheduleItemId?: string,
  entryType: "poster" | "paper" | "team" | "startup_pitch" | "performance" | "custom",
  title: string,
  code: string,
  category: string,
  participantIds: string[],
  presenterNames: string[],
  boothNumber?: string,
  tableNumber?: string,
  orderNumber?: number,
  assignedJudgeIds?: string[],
  status: "registered" | "checked_in" | "waiting" | "next" | "presenting" | "completed" | "absent" | "disqualified",
  result?: {
    rank?: number,
    score?: number,
    notes?: string,
    published?: boolean
  },
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Required work:

- CSV import/export.
- Queue screen.
- Notify-next action to Sang users.
- Timeline events.
- Result management.

### `peProgramPartners/{partnerId}`

Purpose: patrons, sponsors, exhibitors, media partners, institutional partners.

Recommended fields:

```ts
{
  orgId: string,
  programId: string,
  type: "patron" | "sponsor" | "exhibitor" | "media_partner" | "institutional_partner" | "custom",
  tier: string,
  name: string,
  logoUrl: string,
  website: string,
  contactPerson?: string,
  contactEmail?: string,
  benefits?: string[],
  displayOrder: number,
  visibility: "public" | "staffOnly" | "hidden",
  status: "active" | "draft" | "archived",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Important:

- Do not store all sponsors in one giant program document array.
- Keep only summary fields on `pePrograms`, such as `partnerCount` and `featuredPartners`.

### `peProgramJoinRequests/{requestId}`

Purpose: approval queue for request-based QR joins.

Recommended fields:

```ts
{
  orgId: string,
  programId: string,
  joinLinkId: string,
  sangUserId: string,
  category: string,
  requestedEventIds: string[],
  status: "pending" | "approved" | "rejected" | "cancelled",
  reviewedBy?: string,
  reviewedAt?: Timestamp,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Required work:

- `joinProgramByQr`
- Approval/rejection callable
- Organizer approval UI
- Mobile app pending/approved state

### `peActivityLogs/{activityId}` Or Timeline Subcollections

Purpose: participant timeline for check-in, queue, presentation, result, certificate, notifications.

Recommendation:

- Prefer append-only top-level `peActivityLogs` or subcollection per `programPerson`.
- Do not keep infinite activity arrays inside one document.

Recommended fields:

```ts
{
  orgId: string,
  programId: string,
  eventId?: string,
  programPersonId?: string,
  entryId?: string,
  type: string,
  status: string,
  actorUid?: string,
  metadata?: Record<string, unknown>,
  createdAt: Timestamp
}
```

## Developer Checklist Before Any New Work

Before editing code:

1. Pull latest branch.
2. Check current branch; do not work directly on `main` for feature work.
3. Run `git status --short` and make sure you understand all local changes.
4. Read this document.
5. Read `functions/src/index.ts` for server-side write contracts.
6. Read `firestore.rules.eventcrm.partial`.
7. Read `firestore.indexes.eventcrm.json`.
8. Confirm whether the change needs updates in the main Sang repo rules/indexes/storage rules.
9. Confirm whether mobile Sang app also needs a contract change.
10. Decide if the write should happen in client or Cloud Function.

Before adding a new collection:

1. Define owner scope: org, program, event, person, pass, analytics, or audit.
2. Add `orgId`.
3. Add `programId` if program-scoped.
4. Add `eventId` if event-scoped.
5. Add `createdAt` and `updatedAt`.
6. Add rules.
7. Add indexes for expected queries.
8. Add audit logs for sensitive writes.
9. Add cleanup/archive strategy.
10. Add smoke test plan.

Before adding a callable function:

1. Require authenticated user.
2. Validate input with Zod.
3. Check permission with `assertPermission`.
4. Validate document ownership using `orgId/programId/eventId`.
5. Use batch/transaction if writing related docs.
6. Never trust client-supplied status changes for sensitive flows.
7. Write audit log.
8. Return only safe data.
9. Build functions with `npm run build`.
10. Deploy only `eventcrm` functions.

Before deploy:

1. `cd web && npm run lint`
2. `cd web && npm run build`
3. `cd functions && npm run build`
4. If rules changed, merge partial rules into main Sang repo.
5. If indexes changed, merge indexes into main Sang repo.
6. Deploy functions/hosting carefully:

```powershell
firebase deploy --only functions --project sang-d8b93 --non-interactive
firebase deploy --only hosting:sang-event-crm --project sang-d8b93 --non-interactive
```

7. If new Gen 2 callable functions return HTTP 401, verify Cloud Run invoker permissions.
8. Run a live smoke test with a temporary user.
9. Clean up temporary auth/firestore/storage records.
10. Commit to feature branch and push.

## Immediate Next Work Recommended

Priority 1:

- Implement `joinProgramByQr` and mobile app scan-to-join consume flow.
- Add approval queue for `request_approval` mode.
- Add revoke/edit controls for program join links.

Priority 2:

- Implement Sang user linking for uploaded people:
  - normalize email/phone
  - match existing Sang users
  - set `sangUserId`
  - handle pending/conflict/manual review
  - link future signups

Priority 3:

- Implement event entries/queues/results:
  - `peEventEntries`
  - poster/team/pitch import
  - mark next
  - notify linked Sang users
  - result workflow

Priority 4:

- Implement patrons/sponsors:
  - `peProgramPartners`
  - logo upload
  - tier sorting
  - public display settings

Priority 5:

- Scale optimizations:
  - route-level lazy reads
  - pagination for people/check-ins
  - analytics summary jobs
  - async export jobs

## Current Verification Status

Last verified on 2026-08-08:

- Web lint passed.
- Web production build passed.
- Functions TypeScript build passed.
- Hosting deployed to `https://sang-event-crm.web.app`.
- Live backend smoke test passed:
  - temporary auth signup
  - organization create
  - organization update
  - program create
  - program update
  - event create
  - schedule item create
  - secure program join QR create
  - cleanup

Known gap:

- Full visible signed-in browser walkthrough was not completed because the local in-app browser connector failed during verification.

