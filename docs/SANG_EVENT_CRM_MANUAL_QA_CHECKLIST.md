# Sang Event CRM Manual QA Checklist

Last updated: 2026-08-15

Use this checklist before demo, staging release, production deploy, or handing the CRM to an event organizer. The goal is to verify the organizer journey, Sang mobile app publishing, and permission boundaries without relying only on build success.

## QA Result Log

| Area | Tester | Date/time | Browser/device | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Onboarding |  |  |  | Not run |  |
| Program setup |  |  |  | Not run |  |
| Venue setup |  |  |  | Not run |  |
| Event setup |  |  |  | Not run |  |
| Team access |  |  |  | Not run |  |
| People roster |  |  |  | Not run |  |
| Publishing |  |  |  | Not run |  |
| Mobile app |  |  |  | Not run |  |
| Check-in |  |  |  | Not run |  |
| Permissions |  |  |  | Not run |  |

## Test Accounts

Prepare these accounts before QA:

| Account | Purpose | Expected CRM access |
| --- | --- | --- |
| Owner/admin email | Creates organization, roles, programs, events, people, and publishes | Full organization access |
| Program coordinator email | Tests program-scoped access | Only assigned program |
| Event coordinator email | Tests event-scoped access | Only assigned event inside assigned program |
| Gate executive email | Tests scan/check-in only | No edit access |
| Sang mobile attendee email | Tests CRM-to-mobile linking | Program appears in Sang app after publish |
| Non-Sang attendee email | Tests pending link | CRM shows not found/pending after publish |

## Pre-Flight

- Confirm local CRM opens at `http://127.0.0.1:5173` or the hosted CRM URL.
- Confirm Firebase project is `sang-d8b93`.
- Confirm Google sign-in works for CRM accounts.
- Confirm Firestore rules are deployed for the CRM collections.
- Confirm Functions are deployed after backend changes.
- Confirm browser console has no blocking runtime errors.
- Confirm no visible "Missing or insufficient permissions" appears for owner/admin.
- Confirm the active program is selected before testing program-specific pages.

## 1. Login And Onboarding

1. Sign out fully.
2. Sign in with Google as a fresh owner/admin account.
3. Verify first setup screen asks only necessary organization details.
4. Verify logout is available on first setup screen.
5. Create organization with name, category, logo if available, and basic contact.
6. Verify dashboard opens after organization creation.
7. Refresh browser.
8. Verify CRM does not ask the same name/organization details again.
9. If account belongs to multiple organizations, verify organization chooser appears.

Pass criteria:

- No duplicate onboarding questions.
- Organization is created in Firestore.
- User has owner/admin access.
- Refresh keeps the correct CRM state.

## 2. Program Creation And Editing

1. Create a program with:
   - Program name
   - Program type
   - About text with formatting
   - Start/end date and time
   - Logo/banner/poster upload
   - Program venue selected or created
   - Competition/results setting
2. Save program.
3. Verify program appears in choose-program screen.
4. Open program dashboard.
5. Edit program details.
6. Remove/replace banner/logo/poster.
7. Save and refresh.

Pass criteria:

- Rich text about content renders correctly.
- Uploaded media persists.
- Program venue is saved to the program venue catalog.
- Program edit does not create duplicate programs.
- Dashboard content is scrollable on small screens.

## 3. Venue Library

1. Open Venues page.
2. Add venue using map/search/manual details.
3. Add multiple rooms/halls under the same venue.
4. Save.
5. Edit venue name/address/rooms.
6. Delete a room/hall.
7. Use saved venue while creating/editing program and event.

Pass criteria:

- Venue document is one catalog per program.
- Venue dropdown shows venue + room/hall clearly.
- Coordinates are not manually required in schedule rows.
- Event creation only shows saved venues for the selected program.

## 4. Event Creation And Editing

1. Create an event from the selected program.
2. Add:
   - Event name
   - Event type
   - Poster
   - Date/time
   - Saved venue
   - Allowed audience roles
   - Result/competition setting if program supports results
3. Save event.
4. Open event detail page.
5. Edit event details.
6. Delete event only if expected flow allows it, or verify archive/delete behavior.

Pass criteria:

- Event opens as a full page/detail area, not confusing preview-only UI.
- Event card/list shows thumbnail/poster and core details.
- Allowed roles are saved and used later by check-in.
- Event update marks publish events/people as pending where relevant.

## 5. Event Schedule

1. Open event schedule editor.
2. Add multiple schedule rows in one session.
3. For each row verify:
   - Title
   - Type
   - Start/end
   - Visibility
   - Note/description
   - Venue dropdown
   - Room/hall dropdown if venue has rooms
4. Add a new venue from schedule flow.
5. Save schedule.
6. Publish schedule manually.
7. Verify audience schedule reads from published schedule documents.

Pass criteria:

- Schedule does not auto-publish on every row change.
- Saved venue list is reusable.
- Multiple rows save correctly.
- `Publish schedule` becomes highlighted when schedule changes after last publish.

## 6. People Roster

1. Add a person manually with:
   - Full name
   - Email
   - Phone
   - Organization
   - Designation
   - Program audience role
   - Event-wise access and role
2. Save.
3. Verify pass is issued.
4. Edit the person.
5. Add/remove event access.
6. Save.
7. Upload CSV with at least:
   - One Sang user email
   - One non-Sang email
   - One duplicate email row
   - One person with multiple event access columns
8. Verify duplicates merge into one program person row.

Pass criteria:

- People are stored as one document per program person.
- No event subcollection is created under `peProgramPeople`.
- Program role and event-wise roles are clear.
- Tags are not shown or written.
- `Publish to Sang` button turns orange/yellow after add/edit/import.

## 7. Team Access

1. Add a team member as Program Coordinator.
2. Select/create the linked People profile first.
3. Verify selected person appears once only.
4. Add a team member as Event Coordinator.
5. Verify event selector appears after choosing event-scoped role.
6. Add a Gate Executive.
7. Edit team member role/scope/status.
8. Delete team member.
9. Login with invited team email and claim access.

Pass criteria:

- Selected person is not shown twice.
- Team member has `programPersonId`.
- People record uses `isTeamMember` / `teamMemberIds`, not tags.
- Event-scoped user cannot see unrelated events/programs.
- Gate Executive cannot edit program/events/people.

## 8. Event Profiles: Speakers, Guests, Judges, Mentors

1. Open an event and add profile using "Select from People".
2. Search by email/name/phone.
3. Select person.
4. Verify selected person card appears once with Change action.
5. Set public profile type, organization/title override, bio, and photo.
6. Save profile.
7. Add profile using "Create new Person".
8. Use an email that already exists and verify duplicate warning + Use person action.
9. Add profile using "Select from Team".
10. Save event.

Pass criteria:

- Existing People identity fields stay locked.
- Event public profile can have display-specific title/bio/photo.
- No `profileTags` or `profileTag` is written.
- Profile creates/updates event access for that event.
- `Publish to Sang` turns orange/yellow after profile affects people access.

## 9. Publishing

1. On dashboard, verify changed Events, People, and Schedule publish buttons become orange/yellow.
2. Publish events.
3. Publish people.
4. Publish schedule.
5. Verify buttons return to normal after Firestore snapshots update.
6. Verify notices show counts.
7. Verify no internal error appears.

Pass criteria:

- `pePrograms.eventsLastPublishedAt`, `peopleLastPublishedAt`, and `scheduleLastPublishedAt` update.
- Linked Sang users get `users/{uid}/eventAccess/{programId}`.
- Non-Sang people stay pending/not found.
- Old tag fields are deleted on touched people/mirror docs.

## 10. Sang Mobile App Verification

1. Login in Sang mobile with the test attendee account.
2. Confirm program appears after CRM people publish.
3. Open program detail.
4. Verify:
   - Program name/artwork/date/location/about
   - Events assigned to user
   - Event role per event
   - Schedule after schedule publish
   - Pass QR/pass code
5. Use account that is not on roster.
6. Verify program does not appear.

Pass criteria:

- Mobile reads `users/{uid}/eventAccess/{programId}` for access/pass authority.
- Mobile reads published schedule snapshots, not CRM dashboard schedule docs.
- Mobile does not require `pePasses` direct read.

## 11. Check-In And Pass Scan

1. Use scanner session for program gate.
2. Scan attendee pass.
3. Verify check-in success.
4. Scan same pass again and verify expected repeat behavior.
5. Use scanner session for event gate.
6. Scan person allowed for that event.
7. Scan person not allowed for that event.
8. Block person from CRM.
9. Try scanning blocked pass.
10. Unblock person and verify fresh pass behavior.

Pass criteria:

- Event gate respects `allowedAudienceRoleIds`.
- Blocked/removed people cannot check in.
- Check-in activity records correct scope, time, scanner, and status.
- Only Sang pass QR `SANGPASS1:{token}` is accepted.

## 12. Permission Regression

Verify each role:

| Role | Must allow | Must deny |
| --- | --- | --- |
| Owner | Everything in organization | None expected |
| Program Coordinator | Assigned program setup, events, people, passes, reports | Other programs |
| Event Coordinator | Assigned event setup/people/check-in | Other events and organization settings |
| Gate Executive | Scan/check-in | Program/event/people/role edits |

Pass criteria:

- No page leaks unrelated program/event data.
- Firestore permission errors do not appear for allowed pages.
- Restricted users get a clean UI, not broken empty data.

## 13. Visual And UX Pass

Check desktop and mobile widths:

- Login and setup
- Program chooser
- Dashboard
- Program create/edit
- Venues
- Events
- Schedule
- Team
- People
- Settings

Pass criteria:

- No overlapping text/buttons.
- Form scroll works.
- Required fields are marked.
- Missing required fields highlight in red.
- Search dropdowns are visible above maps/panels.
- Selected People cards render once, with Change action.

## Release Decision

Release only if:

- Web build passes.
- Functions build passes.
- Functions deployed successfully.
- Owner happy path passes.
- Team permission checks pass.
- People publish creates mobile mirrors.
- Check-in accepts/denies correct passes.
- No known internal error remains in login, account creation, people publish, venue save, schedule save, or check-in.
