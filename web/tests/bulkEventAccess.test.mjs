import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeEventAccess, runBulkUpdates } from '../src/lib/bulkEventAccess.ts'

const grant = (eventId, roleId = 'participants', status = 'allowed') => ({ eventId, roleId, roleName: roleId, status })

test('granting selected events preserves unrelated roles and inactive access without mutating the person', () => {
  const person = { eventAccess: {
    workshop: grant('workshop', 'visitor'),
    conference: grant('conference', 'speakers', 'registered'),
    restricted: grant('restricted', 'visitor', 'blocked'),
    cancelled: grant('cancelled', 'visitor', 'cancelled'),
    revoked: grant('revoked', 'visitor', 'revoked'),
  } }
  const before = structuredClone(person)
  const access = mergeEventAccess(person, [grant('workshop'), grant('new-event')])
  const byEvent = Object.fromEntries(access.map((entry) => [entry.eventId, entry]))
  assert.equal(byEvent.workshop.roleId, 'participants')
  assert.equal(byEvent['new-event'].roleId, 'participants')
  for (const eventId of ['conference', 'restricted', 'cancelled', 'revoked']) {
    assert.deepEqual(byEvent[eventId], person.eventAccess[eventId])
  }
  assert.deepEqual(person, before)
})

test('supports legacy lists, keeps registration, and repeated grants do not duplicate events', () => {
  const person = { eventAccessList: [grant('workshop', 'visitor', 'registered'), grant('old-event', 'speakers')] }
  const first = mergeEventAccess(person, [grant('workshop')])
  const second = mergeEventAccess({ eventAccessList: first }, [grant('workshop')])
  assert.deepEqual(second, first)
  assert.equal(second.find((entry) => entry.eventId === 'workshop').status, 'registered')
  assert.equal(second.length, 2)
  assert.deepEqual(mergeEventAccess({}, [grant('new')]), [grant('new')])
})

test('the current map takes precedence over a stale legacy list', () => {
  const result = mergeEventAccess({ eventAccess: {}, eventAccessList: [grant('removed')] }, [grant('new')])
  assert.deepEqual(result, [grant('new')])
})

test('processes 100 people with bounded concurrency, reports failures, and retries only failures', async () => {
  const people = Array.from({ length: 100 }, (_, index) => `person-${index}`)
  const calls = new Map()
  let active = 0
  let maximumActive = 0
  const progress = []
  const result = await runBulkUpdates(people, async (person) => {
    calls.set(person, (calls.get(person) || 0) + 1)
    active++
    maximumActive = Math.max(maximumActive, active)
    await new Promise((resolve) => setTimeout(resolve, 1))
    active--
    if (person === 'person-2' || person === 'person-81') throw new Error('Temporary save failure')
  }, (completed) => progress.push(completed))
  assert.equal(result.succeeded.length, 98)
  assert.deepEqual(result.failed.map(({ item }) => item).sort(), ['person-2', 'person-81'])
  assert.equal(calls.size, 100)
  assert.ok([...calls.values()].every((count) => count === 1))
  assert.equal(maximumActive, 4)
  assert.deepEqual(progress, Array.from({ length: 100 }, (_, index) => index + 1))
  const retried = []
  const retry = await runBulkUpdates(result.failed.map(({ item }) => item), async (person) => { retried.push(person) }, () => {})
  assert.deepEqual(retried.sort(), ['person-2', 'person-81'])
  assert.equal(retry.failed.length, 0)
})

test('an empty selection makes no requests', async () => {
  const result = await runBulkUpdates([], async () => assert.fail('Unexpected update'), () => assert.fail('Unexpected progress'))
  assert.deepEqual(result, { succeeded: [], failed: [] })
})
