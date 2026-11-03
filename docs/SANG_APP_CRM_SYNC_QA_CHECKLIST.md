# Sang App And Event CRM Sync QA Checklist

Last updated: 2026-08-21

Use this checklist to test the complete sync between Sang Event CRM and the Sang mobile app.

Primary goal:

- CRM creates and publishes event data.
- Sang app receives only the right attendee-safe data.
- User actions in the app update the right backend state.
- CRM can see the correct analytics after Sang app networking.

## 1. QA Setup

### Required Accounts

| Account | Purpose | Must have |
| --- | --- | --- |
| CRM owner/admin | Creates program, events, people, schedule, publish | CRM owner role |
| Sang attendee A | Linked attendee test | Verified email or phone in Sang app |
| Sang attendee B | Second linked attendee test | Verified email or phone in Sang app |
| Non-Sang attendee | Pending/not-found test | Email/phone not verified in Sang |
| Event coordinator | Permission test | Program/event scoped CRM role |

### Required Devices

- Android device with Sang app installed.
- Optional second device for scan/connection tests.
- Desktop browser for CRM.

### Required Data

- One organization.
- One program.
- At least two events inside the program.
- At least two audience roles, example:
  - Attendee
  - Delegate
- At least one schedule row visible to all.
- At least one schedule row visible only to one role.
- At least one patron/sponsor.
- At least two Sang users in people roster.
- At least one non-Sang roster row.

## 2. CRM Program Setup Test

1. Open CRM.
2. Select organization.
3. Create or select a program.
4. Fill:
   - program name
   - tagline
   - about text with rich formatting
   - start date
   - end date
   - start time
   - end time
   - venue name
   - address
   - how to reach/directions
   - banner/poster/logo where available
5. Save.
6. Refresh browser.

Expected:

- Program persists.
- Dashboard opens in selected program context.
- No duplicate program created.
- Program card/details show saved media and text.

Data to inspect:

- `pePrograms/{programId}`
- `peProgramVenues/{programId}` if venue library is used

## 3. CRM Events Setup Test

1. Open Events page.
2. Create Event 1.
3. Create Event 2.
4. Give different date/time and venue/location notes.
5. Set allowed roles:
   - Event 1: Attendee and Delegate
   - Event 2: Delegate only
6. Save.
7. Click Publish events.

Expected:

- Events save in CRM.
- Dashboard Publish events warning clears after publish.
- Mobile snapshot is written.

Data to inspect:

- `peEvents/{eventId}`
- `peProgramMobileEvents/{programId}`
- `pePrograms/{programId}.eventsLastPublishedAt`

## 4. CRM Schedule Setup Test

1. Open schedule editor.
2. Add schedule row visible to all.
3. Add schedule row linked to Event 1.
4. Add schedule row linked to Event 2 and visible only to Delegate role.
5. Add one grouped/workshop item if supported by current UI.
6. Save rows.
7. Click Publish schedule.

Expected:

- Schedule rows save in CRM source.
- Publish schedule warning clears.
- Mobile schedule snapshot is created.
- Role visibility is preserved.

Data to inspect:

- `peEventScheduleDashboard/{scheduleItemId}`
- `peProgramSchedule/{programId}`
- `peProgramSchedulePages/{programId}_001` when schedule is paged
- `pePrograms/{programId}.scheduleLastPublishedAt`

## 5. CRM People And Pass Test

1. Open People page.
2. Add Sang attendee A:
   - full name
   - verified email or phone matching Sang app user A
   - organization
   - designation
   - program role Attendee
   - Event 1 access allowed
   - Event 2 access not allowed
3. Add Sang attendee B:
   - verified email or phone matching Sang app user B
   - program role Delegate
   - Event 1 access allowed
   - Event 2 access allowed
4. Add one non-Sang attendee.
5. Save.
6. Click Publish people.

Expected:

- Pass is issued for each active person.
- Sang users are linked when verified identity matches.
- Non-Sang attendee stays pending/not found.
- `peopleDirectoryRoles` is updated on program.
- Public people directory is written.

Data to inspect:

- `peProgramPeople/{programPersonId}`
- `pePasses/{passId}`
- `users/{uid}/eventAccess/{programId}` for linked Sang users
- `pePrograms/{programId}/peoplePublic/{programPersonId}`
- `pePrograms/{programId}.peopleDirectoryRoles`
- `pePrograms/{programId}.peopleLastPublishedAt`

## 6. Sang App Claim Test

1. Open Sang app as attendee A.
2. Confirm email/phone is verified.
3. Open Events tab.
4. Tap Claim my event icon.
5. Check claim result sheet.

Expected:

- Linked count increases if access was not already linked.
- If already linked, Events list still shows program.
- No opaque error.
- Guest/anonymous user is gated and asked to log in.

Data to inspect:

- `users/{uid}/eventAccess/{programId}`
- `peProgramPeople/{programPersonId}.linkStatus`

## 7. Sang App Event List Test

1. Open Events tab.
2. Search by program/event text.
3. Switch between Events and Past Events.
4. Pull to refresh.
5. Tap the event/program card.

Expected:

- List opens without mock demo data.
- Card uses real program data.
- Pull-to-refresh does not duplicate access.
- Event detail opens immediately with skeleton/cached state if data is loading.

Data source:

- `users/{uid}/eventAccess`
- `pePrograms/{programId}`

## 8. Sang App About Tab Test

1. Open event detail About tab.
2. Verify program title and tagline.
3. Verify date/time display:
   - one-day program shows date and time
   - multi-day program shows start and end date
4. Verify venue name.
5. Verify rich about text formatting.
6. Verify Inside program event list.
7. Verify allowed and not-allowed icon state.
8. Tap an inside event with long description.
9. Scroll popup text.
10. Close popup.
11. Verify How to reach rich text and location.
12. Verify Your access/pass summary.

Expected:

- Event popup max height is controlled.
- Long popup text scrolls.
- Short popup text does not open unnecessarily tall.
- Not-allowed events still appear with not-allowed indicator.
- No top-edge flicker or loader above banner.

Data source:

- `users/{uid}/eventAccess/{programId}`
- `pePrograms/{programId}`
- `peProgramMobileEvents/{programId}`

## 9. Sang App Schedule Tab Test

1. Open Schedule tab.
2. Confirm first date is chronological.
3. Confirm date chips are sorted.
4. Confirm event chips show:
   - All first
   - event names alphabetically
5. Select All.
6. Select Event 1.
7. Select Event 2.
8. Tap a schedule item.
9. Verify popup shows:
   - event name
   - location
   - address
   - description
   - workshop/group details if present

Expected:

- Attendee A should not see schedule rows where their role/event access is not allowed.
- Delegate attendee should see delegate-only rows.
- Switching chips should not flicker.
- No mock schedule appears.

Backend:

- App calls `getMyProgramSchedule({ programId })`.

## 10. Sang App People Tab Test

1. Open People tab.
2. Verify category chips:
   - All
   - program roles from `pePrograms.peopleDirectoryRoles`
3. Confirm chip labels do not show counts.
4. Tap Attendee/Delegate chips.
5. Confirm chips do not disappear when filtered data changes.
6. Confirm list does not flicker while loading a new role.
7. Toggle Show my card on.
8. If multiple cards exist, choose selected card if UI asks.
9. Toggle Show my card off.
10. Tap another visible person's row.

Expected:

- People list loads in pages.
- Show my card updates immediately.
- If person has `showCard === true`, popup can show safe card details.
- If person has `showCard === false`, popup shows only basic safe person details.
- Do not show "card hidden" copy.
- No connect button if current feature intentionally hides it.

Backend:

- `getEventPeopleDirectory`
- `setEventShowCard`
- `getEventPersonCard`

Data to inspect:

- `users/{uid}/eventAccess/{programId}.showCard`
- `users/{uid}/eventAccess/{programId}.selectedCardId`
- `peProgramPeople/{programPersonId}.showCard`
- `peProgramPeople/{programPersonId}.selectedCardId`
- `pePrograms/{programId}/peoplePublic/{programPersonId}.showCard`

## 11. Sang App Pass Tab Test

1. Open Pass tab.
2. Confirm pass card loads skeleton first if backend is slow.
3. Confirm QR is visible and scannable.
4. Confirm pass code is 8 digits.
5. Confirm person name appears.
6. Confirm designation/company appears under name if available.
7. Confirm program role appears under designation/company.
8. Pull/trigger refresh if available.

Expected:

- App does not read `pePasses` directly.
- Pass status updates through backend.
- QR payload begins with `SANGPASS1:`.

Backend:

- `getMyEventPass`

## 12. Patrons Tab Test

1. Add patron in CRM.
2. Open Patrons tab in Sang app.
3. Tap patron row/card.
4. Confirm detail sheet opens.
5. Tap website if present.

Expected:

- Hidden patrons do not show.
- Website opens in in-app browser with close option.
- Details are readable.

Data source:

- `peProgramPartners`

## 13. Event Mode Scan Test

1. Open Sang app Scan screen.
2. Turn Event mode on.
3. If user has one obvious current event, confirm it auto-fills.
4. If multiple events are possible, confirm suggestion sheet appears.
5. Select event context.
6. Scan another user's Sang card QR.
7. Complete connection.

Expected:

- Connection is created normally.
- Connection has event/program metadata.
- Event name is visible in connection notes/details where implemented.
- CRM analytics can count it.

Data to inspect:

- `users/{scannerUid}/connections/{targetUid}.meta.programId`
- `users/{scannerUid}/connections/{targetUid}.meta.event`
- `connectionPairs/{pairId}.programId`
- `connectionPairs/{pairId}.eventId`
- `connectionPairs/{pairId}.eventName`

## 14. Pass QR As Connection Test

1. On attendee A device, open Pass tab and show QR.
2. On attendee B device, open Scan.
3. Scan attendee A's pass QR.
4. Confirm app does not say "pass could not be read".
5. Confirm resolved Sang card opens.
6. Complete connection.

Expected:

- `resolveEventPassForConnection` returns card and event context.
- Connection flow is same as normal Sang card connection after resolution.
- CRM connection analytics increments after connection.

Backend:

- `resolveEventPassForConnection`
- Sang app `createScanSession`
- Sang app `connectFromScan`

## 15. CRM Networking Analytics Test

1. Open CRM Dashboard for selected program.
2. Find Networking analytics panel.
3. Click Refresh.
4. Record current total.
5. Create one event-mode connection in Sang app.
6. Click Refresh again.

Expected:

- Total connections increases.
- Unique Sang users count reflects both sides of the connection.
- Event breakdown shows event name and count.
- Recent activity shows latest timestamp.

Backend:

- `getProgramConnectionAnalytics`

Data source:

- `connectionPairs` where `programId == selected program id`

## 16. Permission Tests

### CRM Owner

- Can create/edit/publish programs/events/people/schedule.
- Can view dashboard analytics.

### Program Coordinator

- Can access assigned program only.
- Cannot access unrelated programs.

### Event Coordinator

- Can access assigned event/program scope only.
- Cannot publish or edit unrelated event data.

### Gate Executive

- Should not see edit-heavy CRM surfaces if UI is hidden by role.
- Scanner backend requires `checkin.scan` if scanner UI is enabled later.

### Sang App Guest

- Events tab should show login gate.
- Claim my event should not run for anonymous guest.

## 17. Failure Tests

| Scenario | Expected behavior |
| --- | --- |
| User has no verified email/phone | Claim returns no links, clear message |
| CRM people not published | Mobile does not see event or says ask organizer to publish |
| Schedule not published | Schedule tab shows empty state, no fake data |
| People directory not published | People tab shows empty/error state, no fake people |
| Pass revoked/blocked | Pass QR refresh shows non-active status or backend blocks use |
| Pass QR belongs to unlinked person | Scanner says pass is not ready for Sang connection |
| User not allowed in Event 2 | Event 2 still visible in About with not-allowed indicator; restricted schedule hidden |
| Network offline | App shows cached/skeleton/empty states without crashing |

## 18. Final Sign-Off Checklist

- [ ] CRM owner can publish events, people, and schedule.
- [ ] Sang app Events list shows real CRM program.
- [ ] About tab shows real CRM program details.
- [ ] Inside event popup scrolls when description is long.
- [ ] Schedule tab shows only allowed schedule rows.
- [ ] People role chips come from `pePrograms.peopleDirectoryRoles`.
- [ ] People chip switch does not flicker or lose chip list.
- [ ] Show my card on/off updates backend.
- [ ] Pass tab shows QR from `getMyEventPass`.
- [ ] Pass QR can be scanned as connection QR.
- [ ] Event mode card scan saves `programId`.
- [ ] CRM networking analytics increments after connection.
- [ ] No mock event, mock people, mock schedule, or mock patron data appears.
- [ ] Guest user sees login gate.
- [ ] Firestore rules do not allow mobile direct read of `pePasses`.
- [ ] Tester recorded issues with screenshots and document ids.
