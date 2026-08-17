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
8. Secure QR tokens must never be stored raw, except where the current UI temporarily shows a payload. Passes store `tokenHash`.
9. Prefer Cloud Functions for writes that issue credentials, create passes, create scan sessions, perform check-ins, update protected state, or write audit logs.
10. Store operational dates/times as Firestore `Timestamp`, not strings. UI may use `YYYY-MM-DD` or `datetime-local` strings only as form input values before Cloud Functions convert them.
11. Before adding a field, decide whether it belongs to organization, program, event, person, pass, schedule, entry, analytics, or audit.

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
- Update: organization-scoped member with `team.write`.
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

- Default team role ids: `program-coordinator`, `event-coordinator`, `owner`, `gate-executive`
- Default audience role ids: `visitor`, `participants`, `delegates`, `speakers`, `media`, `mentor`, `patrons`
- Custom role ids are created by role editor.

Main fields:

```ts
{
  orgId: string,
  name: string,
  description: string,
  category: "team" | "audience",
  permissions: string[],
  isDefault: boolean,
  status: "active" | "deleted",
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
- `deleteRole` tombstones roles with `status: deleted`; it does not hard-delete docs.

Rules:

- Read: active member.
- Create/update: organization-scoped `roles.write`.
- Hard delete: false from client.

Important behavior:

- Team roles cannot be deleted while assigned to active/invited team members.
- Audience roles are removable, including default audience roles. Delete removes the role from event allow-lists.
- Deleted roles are filtered out in the UI.

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
  programPersonId?: string,
  peopleProgramId?: string,
  status: "active" | "invited" | "disabled" | "deleted" | "claimed",
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
- `updateTeamMember`
- `deleteTeamMember` soft-deletes the member row.
- `claimTeamAccess`

Rules:

- Read: organization-scoped member with `team.write`, or the user reading their own row by `uid`.
- Create/update: organization-scoped `team.write`.
- Hard delete: not allowed.

Important behavior:

- Permission checks in Cloud Functions query `peTeamMembers` where `orgId`, `uid`, and `status == active`.
- Then function reads `peOrganizations/{orgId}/roles/{roleId}`.
- Every sensitive function now checks both permission key and member scope.
- Organization scope can access the whole org.
- Program scope can access only its assigned `programId`.
- Event scope can access only its assigned `programId + eventId`.
- Invites are email-first. When user logs in with the invited email, `claimTeamAccess` makes an active member row.
- New CRM team invites should be linked to a People record using `programPersonId`.
- Team-linked People records keep their original `programRoleId` and are marked with `isTeamMember` / `teamMemberIds` for CRM linkage.

Before changing:

- Be careful with duplicate active rows for same `orgId + uid`.
- If adding phone-based access, normalize phone and add equivalent claim flow.
- Keep backend, frontend queries, and Firestore rules aligned whenever changing scope behavior.

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
  tagline: string,
  programType: string,
  startDate: Timestamp,
  endDate: Timestamp,
  venueName: string,
  city: string,
  logoUrl: string,
  bannerUrl: string,
  posterUrl: string,
  latitude?: number,
  longitude?: number,
  address: string,
  directionsNote: string,
  timezone: string,
  description: string,
  schedule: unknown[],
  infoSections: unknown[],
  fieldDefinitions: unknown[],
  entryScope: "program" | "event" | "both",
  competitive: boolean,
  resultsEnabled: boolean,
  peopleDirectoryRoles?: Array<{ key: string, label: string, count: number }>,
  eventsLastPublishedAt?: Timestamp,
  peopleLastPublishedAt?: Timestamp,
  scheduleLastPublishedAt?: Timestamp,
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

- Read: member with a workspace read-capable permission (`program.read`, `program.write`, `event.write`, `team.write`, `people.import`, `passes.issue`, `checkin.scan`, or `analytics.read`) within organization/program/event scope. Event-scoped users can read the parent program for context.
- Create: organization-scoped `program.write`.
- Update/archive: `program.write` with organization or matching program scope.
- Delete: not allowed.

Important behavior:

- Dashboard is selected-program based.
- CRM data queries are scope-aware; scoped users should never load unrelated programs.
- `mode == standalone` means the program itself can behave like the primary event.
- `mode == multiEvent` means program contains multiple child events in `peEvents`.
- `entryScope` controls whether entry pass should work at program gate, event gate, or both.
- `competitive/resultsEnabled` are program-level controls; event-level result flag is relevant only if program supports competition/results.
- `schedule`, `infoSections`, and `fieldDefinitions` are lightweight program-level content/config placeholders stored directly on `pePrograms`.
- Detailed CRM schedule editing source lives in `peEventScheduleDashboard`; Sang mobile/audience reads the manually published `peProgramSchedule/{programId}` index and `peProgramSchedulePages/{pageId}` rows.
- Saved venue suggestions for one program live in `peProgramVenues/{programId}`. Audience-facing location data is copied into program/event/schedule docs where needed.
- `peopleDirectoryRoles` is refreshed by `publishProgramPeopleAccess` for mobile filtering and directory chips.

Before changing:

- Do not nest events under program unless you migrate all queries/rules/functions. Current decision is top-level `peEvents` with required `programId`.
- Do not hard-delete programs unless you design cascade/archive behavior for events, people, passes, check-ins, schedules, analytics, and audit logs.

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
  description: string,
  startDateTime: Timestamp | null,
  endDateTime: Timestamp | null,
  multiDate: boolean,
  venueName: string,
  locationNote: string,
  directionsNote: string,
  posterUrl: string,
  latitude?: number,
  longitude?: number,
  address: string,
  entryScope: "program" | "event" | "both",
  competitive: boolean,
  resultsEnabled: boolean,
  profiles: Array<{
    id: string,
    programPersonId?: string,
    teamMemberId?: string,
    source?: "people" | "team" | "manual",
    name: string,
    role: string,
    organization?: string,
    designation?: string,
    email?: string,
    phone?: string,
    bio?: string,
    photoUrl?: string
  }>,
  allowedAudienceRoleIds: string[],
  allowedAudienceRoleNames: string[],
  scheduleItemCount: number,
  nextScheduleTitle: string,
  nextScheduleAt: Timestamp | null,
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

- Read: member with a workspace read-capable permission within organization/program/event scope.
- Create: `event.write` with organization or matching program scope.
- Update: `event.write` with organization, matching program, or matching event scope.
- Delete: client delete not allowed; function handles delete.

Important behavior:

- `createEvent` validates that `programId` exists and belongs to `orgId`.
- `updateEvent` validates that event belongs to program and org.
- Event-scoped members can load/edit only their assigned event when their role has `event.write`.
- Schedule summary fields are stored here for fast event list/card rendering.
- Detailed CRM schedule lives in `peEventScheduleDashboard`; audience/mobile schedule is published manually into `peProgramSchedule/{programId}` plus `peProgramSchedulePages/{pageId}`.
- Event profiles should reference `peProgramPeople` with `programPersonId`; adding a speaker/guest from the event screen creates or updates the People record first.
- `allowedAudienceRoleIds` controls scanner entry for event-level gates. Profile roles add suggested allowed role ids, but organizer should verify this list before publishing.

Before changing:

- If delete behavior is changed, consider soft-delete instead of hard-delete because schedule items, people assignments, check-ins, and analytics can point to event ids.
- If adding multi-day schedule, keep item-level times in `peEventScheduleDashboard` and rebuild the audience snapshot only when organizer clicks "Publish schedule".

### `peEventScheduleDashboard/{scheduleItemId}`

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
  startsAt: Timestamp,
  endsAt: Timestamp | null,
  timezone: string,
  venueId: string,
  roomId: string,
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

- Read: member with a workspace read-capable permission within organization/program/event scope.
- Write: false from client. Use Cloud Functions.

Important behavior:

- On create/update/delete, the CRM source is updated only. It does not auto-publish to mobile.
- Organizer must click "Publish schedule" to rebuild the mobile snapshot.
- When organizer enters/selects a venue and optional room/hall, the function upserts that venue into `peProgramVenues/{programId}` for reuse.
- CRM keeps schedule as separate documents so organizer edits, permissions, future audit trails, and large agendas stay manageable.
- Audience/mobile reads the published snapshot instead of reading many CRM schedule documents.

Before changing:

- Add assigned staff if schedule item ownership is required.
- Add reorder logic carefully; do not overwrite unrelated items.

### `peProgramSchedule/{programId}`

Purpose: lightweight mobile schedule index for one program.

Document id:

- Same as `pePrograms/{programId}`

Main fields:

```ts
{
  orgId: string,
  programId: string,
  mode: "empty" | "paged",
  pageSize: number,
  itemCount: number,
  version: number,
  pages: Array<{
    pageId: string,
    pageNo: number,
    itemCount: number,
    dateKeys: string[]
  }>,
  days: Array<{
    dateKey: string,
    dateLabel: string,
    itemCount: number,
    pageIds: string[]
  }>,
  updatedAt: Timestamp
}
```

Created/updated by:

- `publishProgramSchedule`

Rules:

- Read: CRM member with workspace read permission and matching organization/program scope.
- Write: false from client. Use Cloud Functions only.

Important behavior:

- This document stores schedule metadata and page pointers only.
- Actual mobile schedule rows live in `peProgramSchedulePages`.
- `items` is intentionally removed during publish to avoid duplicating the same schedule rows in two collections.
- Mobile should normally call `getMyProgramSchedule`, which verifies `users/{uid}/eventAccess/{programId}` and returns only rows allowed for that user.

### `peProgramSchedulePages/{pageId}`

Purpose: paged mobile schedule item storage for one program.

Document id:

- `${programId}_p001`, `${programId}_p002`, etc.

Main fields:

```ts
{
  orgId: string,
  programId: string,
  pageNo: number,
  itemCount: number,
  dateKeys: string[],
  items: Array<{
    id: string,
    eventId: string,
    title: string,
    type: string,
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
    visibility: "public" | "participantsOnly" | "rolesOnly",
    allowedRoleIds: string[],
    allowedRoleNames: string[],
    status: string,
    sortOrder: number,
    workshops?: Array<object>
  }>,
  updatedAt: Timestamp
}
```

Created/updated by:

- `publishProgramSchedule`

Rules:

- Read: CRM member with workspace read permission and matching organization/program scope.
- Write: false from client. Use Cloud Functions only.

Important behavior:

- `draft`, `cancelled`, and `staffOnly` schedule items are excluded before publishing.
- Child rows with `parentScheduleItemId` are nested under the parent row as `workshops`.
- Role-based rows remain in the page but `getMyProgramSchedule` filters them against the user's program/event role.
- Manual publish keeps organizer control: five draft edits do not create five mobile snapshot versions.

### `peProgramVenues/{programId}`

Purpose: CRM-only saved venue catalog for one program, including rooms/halls/zones under the same physical location.

Document id:

- Same as `pePrograms/{programId}`

Main fields:

```ts
{
  orgId: string,
  programId: string,
  venues: Array<{
    id: string,
    name: string,
    address?: string,
    directionsNote?: string,
    latitude?: number,
    longitude?: number,
    rooms: Array<{
      id: string,
      name: string,
      floor?: string,
      capacity?: number,
      createdAt?: Timestamp,
      updatedAt?: Timestamp,
      lastUsedAt?: Timestamp
    }>,
    createdAt?: Timestamp,
    updatedAt?: Timestamp,
    lastUsedAt?: Timestamp
  }>,
  updatedAt: Timestamp
}
```

Created/updated by:

- `createScheduleItem`
- `updateScheduleItem`

Rules:

- Read: CRM member with workspace read permission and matching organization/program scope.
- Write: false from client. Use Cloud Functions only.

Important behavior:

- This is a CRM convenience catalog, not the audience source of truth.
- If the same auditorium has multiple rooms/halls, store them under one venue instead of creating many duplicate venue entries.
- Event/program/schedule documents still store display venue/room names and coordinates so audience screens can render without joining to this catalog.

### `peProgramPartners/{partnerId}`

Purpose: attendee-facing patrons, sponsors, exhibitors, media/community partners, and program partners.

Document id:

- Auto-generated Firestore id

Main fields:

```ts
{
  orgId: string,
  programId: string,
  name: string,
  tier: string,
  category: string,
  booth: string,
  description: string,
  websiteUrl: string,
  logoUrl: string,
  sortOrder: number,
  status: "active" | "hidden",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created/updated by:

- `saveProgramPartner`
- `deleteProgramPartner` hard-deletes a partner record.

Rules:

- Read: CRM member with workspace read permission and matching organization/program scope, or Sang mobile user with access to the same program.
- Write: false from client. Use Cloud Functions only.

Important behavior:

- The CRM Patrons tab manages this collection.
- The Sang mobile Patrons tab queries `peProgramPartners where programId == selectedProgramId` and hides `status == hidden`.
- Store sponsors as separate docs, not as a large array inside `pePrograms`.

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
  normalizedEmail: string,
  normalizedPhone: string,
  kind: string,
  programRoleId: string,
  programRoleName: string,
  isTeamMember?: boolean,
  teamMemberIds?: string[],
  company: string,
  organization: string,
  designation: string,
  eventAccessIds: string[],
  eventAccess: Record<eventId, {
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
    status: "allowed" | "registered" | "blocked" | "cancelled" | "rejected" | "revoked"
  }>,
  eventAccessList: Array<object>,
  eventRoleKeys: string[],
  passId: string,
  passStatus: "issued" | "checkedIn",
  sangUserId?: string,
  sangUid?: string,
  linkStatus?: "linked" | "pending" | "manual_review",
  linkMethod?: "verified_email" | "verified_phone" | "manual",
  linkedAt?: Timestamp,
  linkConflictReason?: string,
  sangAppStatus?: "linked" | "not_found" | "missing_identity" | "manual_review",
  sangAppLinked?: boolean,
  sangAppUserId?: string,
  sangAppMatchMethod?: "verified_email" | "verified_phone" | "manual" | "",
  sangAppConflictReason?: string,
  sangAppCheckedAt?: Timestamp,
  accessPublishedAt?: Timestamp,
  accessLastPublishedAt?: Timestamp,
  accessLastPublishedBy?: string,
  source?: "manual" | "csv_import" | "api",
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created/updated by:

- `createProgramPersonAndPass`
- `issuePassForProgramPerson`
- CSV import UI loops through rows and calls create flow.
- `publishProgramPeopleAccess` links verified Sang users and writes mobile mirrors.
- `scanPassToken` updates `passStatus` to `checkedIn`.

Rules:

- Read: member with `people.import`, `passes.issue`, or `analytics.read` within organization/program/event assignment scope.
- Write: false from client. Use Cloud Functions for create/update.

Important behavior:

- Every uploaded attendee/participant should have a row here, whether they are Sang users or not.
- If a person is already a Sang user, link using `sangUserId`; do not skip CRM record.
- If person is not a Sang user yet, keep row pending and link later when they sign up or the organizer publishes again.
- `linkStatus` is the backend workflow status; `sangAppStatus` is the organizer-friendly match status shown in CRM.
- `sangAppStatus == not_found` means email/phone was present but no verified Sang user matched at the time of check.
- `sangAppStatus == missing_identity` means the row cannot be matched because email/phone is missing.
- `eventAccessIds` is required for event-scoped reads and event gate access.
- One person row stores all event access for that program. Do not create per-event subcollections for normal attendee/event access.
- Event/program public profiles and CRM team members should select/create a People record first, then reference that person by `programPersonId`.
- A person's base `programRoleId` should not be overwritten just because they are shown as a speaker/mentor/organizer somewhere. Use event-level `eventAccess.{eventId}.roleId` and the event's public `profiles[]` list for those extra responsibilities.

Before changing:

- Do not replace this collection with Sang app `users`; CRM event registration must preserve event-specific metadata.
- Add dedupe rules before bulk import: likely unique key `programId + normalizedEmail` or `programId + normalizedPhone`.
- Add import status/errors instead of silently failing row uploads.

### Legacy: `peProgramPeople/{programPersonId}/events/{eventId}`

Purpose: older event-level assignment idea.

Current status:

- Do not use for new people/event access.
- Current implementation stores event access directly on `peProgramPeople/{programPersonId}` as `eventAccess`, `eventAccessIds`, `eventAccessList`, and `eventRoleKeys`.
- If old subcollection docs exist, they can be safely ignored after migration/cleanup.

Created by:

- `createProgramPersonAndPass` when event ids are passed.

Rules:

- Read: member with `people.import`, `passes.issue`, or `analytics.read` within the specific event scope.
- Write: false from client. Use Cloud Functions.

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
  passCode: string, // 8-digit display/support code, not used for scan validation
  status: "issued" | "checkedIn" | "revoked",
  delivery: {
    channel: "manual" | "email" | "sms" | "app",
    status: "notSent" | "sent" | "failed"
  },
  qrUpdatedAt?: Timestamp,
  qrUpdatedBy?: string,
  qrRotationCount?: number,
  createdAt: Timestamp,
  updatedAt: Timestamp
}
```

Created by:

- `createProgramPersonAndPass`
- `issuePassForProgramPerson`

Updated by:

- `scanPassToken`
- `issuePassForProgramPerson` when organizer refreshes a QR. Existing pass docs are updated in place so `passId` stays stable.

Rules:

- Read: member with `passes.issue` and organization/program scope. Event-scoped members should scan through Cloud Functions, not read all pass docs.
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

- Read: member with `checkin.scan` or `analytics.read` within organization/program/event scope.
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
  eventIds: string[],
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

- Read: member with `people.import`, `passes.issue`, or `analytics.read` within organization/program/event import scope.
- Create: `people.import` within organization/program/event import scope.
- Update/delete: false.

Important behavior:

- Current CSV import creates records client-side after looped callable creates people/passes.
- Import history now stores `eventIds` so event-scoped importers can write logs only for their assigned event.

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

- Sang mobile app reads event/program access summary under its own user document.
- The same document now includes `passQrPayload`, so the Sang app can render the attendee entry QR without reading `pePasses`.

Current status:

- Implemented as the mobile mirror for linked attendees/participants.
- Written by `createProgramPersonAndPass` when an imported person already matches a verified Sang user.
- Written/refreshed by `publishProgramPeopleAccess`.
- Written by `claimMyEventAccess` when Sang user claims matching uploaded rows after login.
- Written/refreshed by `issuePassForProgramPerson` when a pass is issued or rotated.

`claimMyEventAccess` identity sources:

- Firebase Auth verified email.
- Firebase Auth phone number.
- `users/{uid}.verifiedEmail`.
- `users/{uid}.verifiedPhone`.

Current mirror shape:

```ts
users/{uid}/eventAccess/{programId}
{
  uid: string,
  orgId: string,
  programId: string,
  programPersonId: string,
  passId: string,
  passQrPayload: 'SANGPASS1:{token}',
  passCode: '48291370',
  passStatus: string,
  programName: string,
  programType: string,
  mode: string,
  status: string,
  startDate: Timestamp | null,
  endDate: Timestamp | null,
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
  personName: string,
  personKind: string,
  programRoleId: string,
  programRoleName: string,
  linkStatus: string,
  linkMethod: string,
  allowedEventIds: string[],
  eventAccess: Record<string, {
    eventId: string,
    eventNameSnapshot: string,
    roleId: string,
    roleName: string,
    status: string
  }>,
  eventAccessList: Array<{
    eventId: string,
    eventNameSnapshot: string,
    roleId: string,
    roleName: string,
    status: string
  }>,
  eventRoleKeys: string[],
  eventCount: number,
  nextScheduleTitle: string,
  nextScheduleAt: Timestamp | null,
  updatedAt: Timestamp
}
```

Important:

- Mobile should use this mirror as the primary Events tab source.
- Mobile should not read `pePasses` directly.
- Program scan-to-join is intentionally not implemented.

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
- Requires organization-scoped `team.write`.
- Writes audit log.

`setActiveOrganization`

- Sets `peUsers/{uid}.activeOrgId`.
- Requires `program.read` in target org. Organization/program/event scope is accepted because this only switches active org.

`claimTeamAccess`

- Finds invited `peTeamMembers` rows by normalized email.
- Creates active `peTeamMembers/{orgId}_{uid}` row.
- Marks invite row as `claimed`.
- Updates/creates `peUsers/{uid}`.

### Roles/Team

`createRole`

- Upserts role doc under organization.
- Requires organization-scoped `roles.write`.
- Team roles need at least one permission; audience roles store empty permissions.
- Writes audit log.

`deleteRole`

- Tombstones the role with `status: deleted`.
- Requires organization-scoped `roles.write`.
- Blocks team role delete while active/invited members use it.
- For audience roles, removes the role from event allow-lists.
- Writes audit log.

`inviteTeamMember`

- Creates invited team member row.
- Requires organization-scoped `team.write`.
- Validates role is an active team role.
- Validates assigned scope: organization, program, or event.
- Writes audit log.

`updateTeamMember`

- Updates name, role, scope, and status.
- Requires organization-scoped `team.write`.
- Blocks owner downgrade, self-disable, and moving claimed members back to invited.
- Writes audit log.

`deleteTeamMember`

- Soft-deletes the team member by setting `status: deleted`.
- Requires organization-scoped `team.write`.
- Blocks owner delete and self-delete.
- Removes org from linked `peUsers.organizationIds` if the member already has a `uid`.
- Writes audit log.

### Programs/Events

`createProgram`

- Creates `pePrograms/{programId}`.
- Initializes program-level content placeholders on `pePrograms/{programId}`: `schedule`, `infoSections`, `fieldDefinitions`.
- Requires organization-scoped `program.write`.
- Writes audit log.

`updateProgram`

- Updates selected program.
- Validates program belongs to org.
- Requires `program.write` with organization or matching program scope.
- Writes audit log.

`deleteProgram`

- Soft-archives program by setting `status: archived`.
- Requires `program.write` with organization or matching program scope.
- Writes audit log.

`createEvent`

- Creates `peEvents/{eventId}`.
- Validates parent program.
- Requires `event.write` with organization or matching program scope.
- Writes audit log.

`updateEvent`

- Updates event.
- Validates event belongs to org and program.
- Requires `event.write` with organization, matching program, or matching event scope.
- Writes audit log.

`deleteEvent`

- Hard-deletes event doc currently.
- Requires `event.write` with organization, matching program, or matching event scope.
- Writes audit log.

### Schedule

`createScheduleItem`

- Creates `peEventScheduleDashboard/{scheduleItemId}`.
- Validates program and optional event.
- Requires `event.write` with organization, matching program, or matching event scope.
- Upserts selected/typed venue and room into `peProgramVenues/{programId}`.
- Does not publish to mobile automatically.
- Writes audit log.

`updateScheduleItem`

- Updates schedule item.
- Requires `event.write` with organization, matching program, or matching event scope.
- Upserts selected/typed venue and room into `peProgramVenues/{programId}`.
- Does not publish to mobile automatically.
- Writes audit log.

`deleteScheduleItem`

- Deletes schedule item.
- Requires `event.write` with organization, matching program, or matching event scope.
- Does not publish to mobile automatically.
- Writes audit log.

`publishProgramSchedule`

- Reads `peEventScheduleDashboard` for the selected program.
- Excludes draft, cancelled, and staff-only rows.
- Nests child rows under their parent schedule item as `workshops`.
- Writes metadata to `peProgramSchedule/{programId}`.
- Writes actual schedule rows to `peProgramSchedulePages/{pageId}`.
- Deletes the old `items` field from `peProgramSchedule/{programId}` to avoid duplicate storage.
- Requires `event.write` with organization or matching program scope.
- Writes audit log.

### People/Passes/Check-In

`createProgramPersonAndPass`

- Creates `peProgramPeople/{programPersonId}`.
- Stores all event access on the person document using `eventAccess`, `eventAccessIds`, `eventAccessList`, and `eventRoleKeys`.
- Creates `pePasses/{passId}`.
- Returns `qrPayload: SANGPASS1:{token}`.
- Requires both `people.import` and `passes.issue` with organization, matching program, or matching event scope.
- Writes audit log.

`publishProgramPeopleAccess`

- Organizer action from People roster.
- Requires `people.import` for the selected program.
- Reads all `peProgramPeople` for the program.
- Matches verified Sang users by `users.verifiedEmail` and `users.verifiedPhone`.
- Updates `peProgramPeople.sangUserId/sangUid/linkStatus/linkMethod`.
- Ensures every linked person has an issued pass.
- Writes/refreshes `users/{uid}/eventAccess/{programId}`.
- Refreshes `pePrograms.peopleDirectoryRoles` for app filters.
- Sends best-effort FCM notification through top-level `devices` tokens.
- Writes audit log.

`issuePassForProgramPerson`

- Creates a pass if the person does not have one.
- If the person already has `passId`, updates the same `pePasses/{passId}` with a new token hash, QR payload, pass code, `qrUpdatedAt`, `qrUpdatedBy`, and `qrRotationCount`.
- Keeps `passId` stable so `peProgramPeople` and `users/{uid}/eventAccess/{programId}` do not need a pass id replacement.
- Requires `passes.issue` with organization, matching program, or matching event scope.
- Writes audit log.

`createScannerSession`

- Creates `peScannerSessions/{scannerSessionId}`.
- Returns raw scanner token once.
- Requires `checkin.scan` with organization, matching program, or matching event scope.

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
peEvents: orgId ASC, programId ASC
peEvents: programId ASC, startDateTime ASC
peEventScheduleDashboard: orgId ASC, programId ASC
peEventScheduleDashboard: orgId ASC, eventId ASC
peEventScheduleDashboard: programId ASC, startsAt ASC
peProgramVenues: orgId ASC, programId ASC
peProgramPartners: orgId ASC, programId ASC
peProgramPartners: programId ASC, sortOrder ASC
peProgramPeople: orgId ASC, programId ASC
peProgramPeople: orgId ASC, eventAccessIds ARRAY_CONTAINS
peProgramPeople: programId ASC, kind ASC
peProgramPeople: programId ASC, normalizedEmail ASC
peProgramPeople: programId ASC, normalizedPhone ASC
peProgramPeople: orgId ASC, email ASC
pePasses: orgId ASC, programId ASC
pePasses: tokenHash ASC, status ASC
peCheckIns: orgId ASC, programId ASC
peCheckIns: orgId ASC, eventId ASC
peCheckIns: programId ASC, createdAt DESC
peScannerSessions: scannerUid ASC, status ASC, expiresAt ASC
peExports: orgId ASC, createdAt DESC
```

Before adding queries:

- Check if the query already has a matching index.
- Any query with multiple `where` plus `orderBy` may need a new index.
- Update both CRM partial index file and main Sang project index file before deploy.

## Firestore Read Model In Frontend

`CrmApp` first resolves active CRM access:

```ts
peOrganizations/{orgId}
peOrganizations/{orgId}/roles
peTeamMembers where orgId == activeOrgId && uid == auth.uid && status == active
```

Then it chooses permission-aware and scope-aware queries:

```txt
Organization scope:
pePrograms where orgId == activeOrgId
peEvents where orgId == activeOrgId
peEventScheduleDashboard where orgId == activeOrgId
peProgramVenues where orgId == activeOrgId
peProgramPartners where orgId == activeOrgId
peProgramPeople where orgId == activeOrgId
pePasses where orgId == activeOrgId
peCheckIns where orgId == activeOrgId
peTeamMembers where orgId == activeOrgId, only when role can manage team

Program scope:
pePrograms where orgId == activeOrgId && documentId == member.programId
peEvents where orgId == activeOrgId && programId == member.programId
peEventScheduleDashboard where orgId == activeOrgId && programId == member.programId
peProgramVenues where orgId == activeOrgId && documentId == member.programId
peProgramPartners where orgId == activeOrgId && programId == member.programId
peProgramPeople where orgId == activeOrgId && programId == member.programId
pePasses where orgId == activeOrgId && programId == member.programId
peCheckIns where orgId == activeOrgId && programId == member.programId

Event scope:
pePrograms where orgId == activeOrgId && documentId == member.programId
peEvents where orgId == activeOrgId && documentId == member.eventId
peEventScheduleDashboard where orgId == activeOrgId && eventId == member.eventId
peProgramVenues where orgId == activeOrgId && documentId == member.programId
peProgramPeople where orgId == activeOrgId && eventAccessIds array-contains member.eventId
peCheckIns where orgId == activeOrgId && eventId == member.eventId
no direct pePasses/team list query
```

Important:

- This is simple and good for MVP.
- Workspace catalog queries run for roles with `program.read`, `program.write`, `event.write`, `team.write`, `people.import`, `passes.issue`, `checkin.scan`, or `analytics.read`.
- People queries run only for roles with `people.import`, `passes.issue`, or `analytics.read`.
- Pass queries run only for roles with `passes.issue`.
- Check-in queries run only for roles with `checkin.scan` or `analytics.read`.
- Firestore rules are not filters. Any new frontend query must include enough `where` clauses to match the scoped rule.
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
   - starter fields on the program document: `schedule`, `infoSections`, `fieldDefinitions`
   - audit log
4. Program appears in chooser/dashboard.

### Organizer Creates Event

1. User selects program.
2. User adds event name/type/date/time/location/poster/entry/result settings.
3. `createEvent` validates parent program and creates `peEvents/{eventId}`.
4. Event appears in selected program's events list.

### Organizer Adds Schedule

1. User opens event detail.
2. User creates schedule item and selects an existing venue/room or types a new one.
3. `createScheduleItem` creates `peEventScheduleDashboard/{scheduleItemId}`.
4. Function upserts reusable venue/room data in `peProgramVenues/{programId}`.
5. Organizer can keep adding/editing/deleting rows without affecting the Sang mobile schedule.
6. Organizer clicks "Publish schedule".
7. `publishProgramSchedule` rebuilds `peProgramSchedule/{programId}` and `peProgramSchedulePages/{pageId}` for Sang mobile/audience reads.

### Organizer Imports People

1. User uploads CSV.
2. UI parses rows.
3. For each row, UI calls `createProgramPersonAndPass`.
4. Function creates:
   - `peProgramPeople/{programPersonId}`
   - event access fields directly on the person document
   - `pePasses/{passId}`
5. UI creates `peImports/{importId}` with import summary.
6. Organizer clicks Publish to Sang.
7. `publishProgramPeopleAccess` links matching verified Sang users, writes `users/{uid}/eventAccess/{programId}`, and sends notifications where possible.

### Gate Check-In

1. Staff creates scanner session through `createScannerSession`.
2. Scanner receives `scannerSessionId` and `scannerToken`.
3. Staff scans pass QR payload `SANGPASS1:{token}`.
4. `scanPassToken` validates scanner session.
5. Function hashes token and finds pass by `tokenHash`.
6. Function creates `peCheckIns/{checkInId}`.
7. If first valid scan, pass/person become checked in.

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

- Wire Sang mobile app to read `users/{uid}/eventAccess/{programId}` and show published CRM programs.
- Confirm mobile pass display and scanner handoff for `SANGPASS1:{token}`.
- Run full roster publish smoke test with verified email/phone matches.

Priority 2:

- Add CSV bulk import progress/error handling so large rosters do not silently fail.
- Add scheduled/triggered future-signup linking so newly created Sang users can claim existing CRM rows automatically.
- Add notification delivery status tracking for roster publish.

Priority 3:

- Implement event entries/queues/results:
  - `peEventEntries`
  - poster/team/pitch import
  - mark next
  - notify linked Sang users
  - result workflow

Priority 4:

- Add sponsor/patron engagement reports later if needed:
  - booth visits
  - sponsor lead export
  - patron profile taps
  - website click analytics

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
  - cleanup

(This run also exercised secure program join QR create. That feature was removed on 2026-08-12 and no longer applies.)

Known gap:

- Full visible signed-in browser walkthrough was not completed because the local in-app browser connector failed during verification.
