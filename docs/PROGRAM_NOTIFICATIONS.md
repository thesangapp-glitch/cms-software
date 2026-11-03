# Program notifications

Open a program and choose **Notifications** in the sidebar, immediately below
People & Passes. This is a program-level push notification composer.

## Organizer workflow

1. Choose all active people, program roles, event access, or individual people.
2. Event audiences can also filter by role within the selected events. Multiple
   events/roles match any selected value; the event and role must match the same
   access entry. Program-role audiences use the person's program role.
3. Manual selection supports name/email/phone search, a role filter, select all
   matching, deselect matching, and clear. Selections outside current filters are
   retained and counted explicitly.
4. Enter a title (100 characters maximum) and message (500 characters maximum).
5. Review the message, audience, eligible people/devices, and exclusion counts.
6. Confirm **Send**. History reports provider acceptance, partial failure, failure,
   or an uncertain result. Acceptance is not a delivery or read receipt.

Only active, linked Sang users with current mobile program access and an active
device granting notification permission are eligible. Duplicate Sang accounts
and duplicate device tokens are deduplicated. The CRM never accepts arbitrary
push tokens or Sang UIDs supplied by a sender.

## Mobile behavior

No mobile files were changed. The payload uses the existing contract:

```json
{
  "type": "event_program_access",
  "orgId": "organization-id",
  "programId": "program-id",
  "notificationId": "notification-job-id",
  "url": "sang://events/program-id"
}
```

The current Sang `RootNavigator.tsx` handler opens
`Main / Events / EventDetail` with `eventId = programId`. Selecting an event in the
CRM filters recipients; the tap destination is the parent program's event screen.
Opening a particular session/tab would need additional mobile routing support.
Installed app versions must contain the existing handler, and notification
permission must already be granted. A real-device acceptance/tap test is still
required after deployment; automated tests mock both push providers.

Sang currently stores the result of `getDevicePushTokenAsync()` in
`devices/{deviceId}.fcmToken`. This is a native FCM token on Android and a native
APNs token on iOS. Android uses Firebase Admin messaging and the app's existing
`connections` notification channel. iOS uses APNs HTTP/2 with token authentication.

## Access and data

The tab and all three callables require `people.import` or `*`, an active team
membership, and ownership of the chosen organization/program. Program staff are
limited to their assigned program. Event staff are restricted to recipients with
active access to their assigned event, including when selecting all people or
using a role/manual filter. Event staff see only their own notification history.
Archived programs cannot send notifications.

Callables in the `eventcrm` codebase, region `us-central1`:

| Callable | Input | Result |
| --- | --- | --- |
| `previewProgramNotification` | `orgId`, `programId`, `title`, `body`, `audience` | Immutable draft ID, message and counts; no pushes |
| `sendProgramNotification` | `orgId`, `programId`, `notificationId` | Status and aggregate provider results |
| `listProgramNotifications` | `orgId`, `programId`, optional `notificationId` | Recent history or a pending send's status |

`audience` contains `mode: all | roles | events | people` and optional arrays
`roleIds`, `eventIds`, `eventRoleIds`, `personIds`. The last array contains
`peProgramPeople` document IDs, not mobile user IDs. Empty selections are rejected
except in all-people mode.

Jobs live in `pePrograms/{programId}/notifications/{notificationId}`. Each stores
organization/program IDs, author, audience, content, scope, a private recipient
fingerprint, counts, timestamps, status, and aggregate results. Device tokens are
never stored in these jobs or returned to the browser. Client access is through
the callables; existing rules have no client grant for this nested collection.
Sending also creates a `peAuditLogs` record in the same transaction as its claim.
No rules/index changes are needed for the current queries.

Previews expire after ten minutes. Send rechecks permission, scope, access,
recipients and devices before claiming the draft; changed audiences require a
fresh review. A Firestore transaction claims each draft once. Repeated calls with
that draft ID return its state and never resend. A provider/network failure is
not automatically retried. A new draft is a new send, so review history before
manually creating a replacement for an uncertain notification.

The browser remembers a pending draft ID in session storage. If a response is
lost, **Check send status** resolves it before allowing another message. If the
server still has an unclaimed draft, confirmation reuses the same ID. An
interrupted send still marked `sending` after ten minutes becomes `uncertain`
when checked, allowing the UI to recover without resending.

Initial operational limits are 2,000 total roster records per program, 100 device
records per recipient, and 1,000 eligible devices per send. Limits fail explicitly
instead of silently dropping recipients. Android batches contain at most 500
tokens. Apple sends have eight workers, ten-second per-request timeouts, and a
shared deadline. Functions have a five-minute timeout. History displays up to
20 eligible records from the 50 most recent started sends; drafts are excluded.
Draft expiry prevents sending but does not automatically delete draft documents.

## Server setup and deployment

Deployment verified on **25 October 2026 (Asia/Calcutta)**: all three notification
callables are active in `sang-d8b93/us-central1`. Their authentication and browser
CORS checks pass. FCM also accepted a validation-only Android push using the
notification payload and an active registered device token; no message was
delivered. Previously, these endpoints returned 404, which appeared as
`internal` in the CRM. The frontend now also gives a readable service error.

The deployed `SANG_APNS_CONFIG` version 1 contains `{}`. Android delivery is
enabled; iOS transport is implemented but iPhone recipients remain excluded until
Apple push credentials are configured. The supplied secrets folder contained
Firebase configuration and Android signing files, but no APNs private key.
`GoogleService-Info.plist` is not an APNs signing key. The iOS bundle ID is
`com.sang.business.app`. No real notification was sent during verification.

The local UI is available through Vite. For a new environment, real sending
requires deploying the three callables. The Firebase project is `sang-d8b93`.

Create Secret Manager secret `SANG_APNS_CONFIG` before deploying the preview/send
functions. For Android-only operation, set its JSON value to `{}`. The review
screen then clearly excludes iPhone devices. For iPhone delivery, use the Apple
push key authorized for the installed app, its team/key IDs, the app bundle ID,
and the correct APNs environment:

```json
{
  "keyId": "APPLE_KEY_ID",
  "teamId": "APPLE_TEAM_ID",
  "bundleId": "YOUR_INSTALLED_APP_BUNDLE_ID",
  "environment": "production",
  "privateKey": "-----BEGIN PRIVATE KEY-----\nYOUR_P8_KEY\n-----END PRIVATE KEY-----"
}
```

Use `sandbox` for a development build using the APNs sandbox; App Store/TestFlight
builds use `production`. One environment is configured for this sender. Never
commit the key or include it in a web environment variable. Store the JSON through
the secure Firebase CLI prompt:

```powershell
firebase functions:secrets:set SANG_APNS_CONFIG --project sang-d8b93
```

Run `npm test` in `functions`, and `npm run build` plus `npm run lint` in `web`.
Then, from the repository root, deploy only the new function exports:

```powershell
firebase deploy --only "functions:eventcrm:previewProgramNotification,functions:eventcrm:sendProgramNotification,functions:eventcrm:listProgramNotifications" --project sang-d8b93
```

Redeploy preview/send after rotating this secret. Deploy the web app separately
using the repository's [hosting instructions](HOSTING.md) when ready. Do not
deploy project-wide Firestore rules or indexes from this repository.

## Validation

`functions/tests/programNotifications.test.cjs` tests recipient resolution,
permission/scope checks, fresh-preview enforcement, concurrent claims, audit
creation, interrupted/partial sends, history isolation, and limits against an
in-memory store. `notificationTransport.test.cjs` mocks FCM and HTTP/2, checks
batch sizes, routing payloads, and verifies the APNs JWT signature.

`web/tests/notifications.browser.cjs` renders the real page in Edge through Vite
and intercepts all Firebase calls. It tests role/event/manual selection, 100-person
select-all, review/cancel/send, exclusion counts, history, ambiguous responses,
same-ID recovery, changed audiences, empty audiences, event scope and narrow
screen layout. It blocks every non-local network request.

To run it with Playwright installed in a separate tooling directory, start Vite
on `127.0.0.1:5173`, then from `web`:

```powershell
$env:PLAYWRIGHT_MODULE = 'C:\path\to\tooling\node_modules\playwright'
node tests/notifications.browser.cjs
```

Screenshots are written to the operating system's temporary directory.
