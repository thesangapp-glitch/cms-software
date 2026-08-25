#!/usr/bin/env node
/*
 * One-time maintenance: normalize date fields that were stored as Firestore
 * Timestamps (or Dates / epoch numbers) back into the plain strings the CRM
 * expects. The app is already resilient to Timestamps (see dateSortKey /
 * displayDate in web/src/App.tsx), so this is purely for clean, consistent data.
 *
 *   pePrograms            startDate, endDate         -> "YYYY-MM-DD"
 *   peEvents              startDateTime, endDateTime -> "YYYY-MM-DDTHH:mm"
 *   peEventScheduleItems  startsAt, endsAt           -> "YYYY-MM-DDTHH:mm"
 *
 * Values that are already strings are left untouched, so it is safe to run
 * repeatedly (idempotent). Runs as a DRY RUN by default and prints every change
 * it would make; pass --apply to actually write.
 *
 * Auth (pick one), then run from the repo root:
 *   gcloud auth application-default login && export GCLOUD_PROJECT=sang-d8b93
 *     -- or --
 *   export GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccount.json
 *
 *   node functions/scripts/normalize-dates.cjs           # dry run, no writes
 *   node functions/scripts/normalize-dates.cjs --apply   # write the changes
 *
 * Timestamps are absolute instants but the CRM's date/datetime-local inputs are
 * timezone-naive, so we render each instant in TIME_ZONE (default Asia/Kolkata).
 * Override with TZ_OVERRIDE=America/New_York if your events are elsewhere.
 */

const admin = require('firebase-admin')

const PROJECT_ID = process.env.GCLOUD_PROJECT || 'sang-d8b93'
const TIME_ZONE = process.env.TZ_OVERRIDE || 'Asia/Kolkata'
const APPLY = process.argv.includes('--apply')

admin.initializeApp({ projectId: PROJECT_ID })
const db = admin.firestore()

const TARGETS = [
  { collection: 'pePrograms', fields: ['startDate', 'endDate'], format: 'date' },
  { collection: 'peEvents', fields: ['startDateTime', 'endDateTime'], format: 'datetime' },
  { collection: 'peEventScheduleItems', fields: ['startsAt', 'endsAt'], format: 'datetime' },
]

// Any Timestamp/Date/number -> JS Date. Strings (already correct) and null return null.
function toDate(value) {
  if (value == null || typeof value === 'string') return null
  if (typeof value.toDate === 'function') return value.toDate() // Firestore Timestamp
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  return null
}

function format(date, kind) {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).reduce((o, part) => ((o[part.type] = part.value), o), {})
  const day = `${p.year}-${p.month}-${p.day}`
  const hour = p.hour === '24' ? '00' : p.hour // some runtimes emit "24" at midnight
  return kind === 'date' ? day : `${day}T${hour}:${p.minute}`
}

async function run() {
  console.log(`Project: ${PROJECT_ID} | Timezone: ${TIME_ZONE} | Mode: ${APPLY ? 'APPLY (writing)' : 'DRY RUN'}\n`)
  let totalFields = 0
  let totalDocs = 0

  for (const target of TARGETS) {
    const snap = await db.collection(target.collection).get()
    let batch = db.batch()
    let batched = 0
    let changedDocs = 0

    for (const doc of snap.docs) {
      const data = doc.data()
      const update = {}
      for (const field of target.fields) {
        const date = toDate(data[field])
        if (date) {
          update[field] = format(date, target.format)
          totalFields++
        }
      }
      if (Object.keys(update).length > 0) {
        changedDocs++
        console.log(`  ${target.collection}/${doc.id}`, JSON.stringify(update))
        if (APPLY) {
          batch.update(doc.ref, update)
          if (++batched === 400) {
            await batch.commit()
            batch = db.batch()
            batched = 0
          }
        }
      }
    }
    if (APPLY && batched > 0) await batch.commit()
    totalDocs += changedDocs
    console.log(`${target.collection}: ${changedDocs} of ${snap.size} doc(s) need fixing.\n`)
  }

  console.log(`${APPLY ? 'Updated' : 'Would update'} ${totalFields} field(s) across ${totalDocs} doc(s).`)
  if (!APPLY) console.log('Re-run with --apply to write these changes.')
}

run()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
