const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Timestamp, FieldValue } = require('firebase-admin/firestore');
const { HttpsError } = require('firebase-functions/v2/https');
const { createProgramNotifications } = require('../lib/programNotifications');
const { notificationInputSchema } = require('../lib/notificationAudience');

// No Firebase app or transport is initialized. These tests exercise the service
// against an in-memory store, including a serialized transaction claim.
function fakeStore() {
  const records = new Map();
  let nextId = 0;
  let transactionTail = Promise.resolve();
  const snapshot = (path) => ({ id: path.split('/').at(-1), data: () => records.get(path) });
  const resolveFields = (value) => Object.fromEntries(Object.entries(value).map(([key, item]) => [key, item instanceof FieldValue ? Timestamp.now() : item]));
  const document = (path) => ({
    path, id: path.split('/').at(-1), get: async () => snapshot(path),
    collection: (name) => collection(`${path}/${name}`),
    create: async (value) => { assert.equal(records.has(path), false); records.set(path, resolveFields(value)); },
    update: async (value) => { assert.ok(records.has(path)); records.set(path, { ...records.get(path), ...resolveFields(value) }); },
  });
  const collection = (path, filters = [], ordering = null, limit = Infinity) => ({
    doc: (id = `job-${++nextId}`) => document(`${path}/${id}`),
    where: (field, op, value) => { assert.equal(op, '=='); return collection(path, [...filters, [field, value]], ordering, limit); },
    orderBy: (field, direction) => collection(path, filters, [field, direction], limit),
    limit: (count) => collection(path, filters, ordering, count),
    get: async () => {
      let paths = [...records.keys()].filter((key) => key.startsWith(`${path}/`) && key.split('/').length === path.split('/').length + 1
        && filters.every(([field, value]) => records.get(key)[field] === value));
      if (ordering) {
        const [field, direction] = ordering;
        paths = paths.filter((key) => records.get(key)[field] !== undefined).sort((a, b) => {
          const value = (key) => records.get(key)[field]?.toMillis?.() || 0;
          return (value(a) - value(b)) * (direction === 'desc' ? -1 : 1);
        });
      }
      const docs = paths.slice(0, limit).map(snapshot);
      return { docs, size: docs.length, empty: docs.length === 0 };
    },
  });
  return {
    records, collection,
    runTransaction: (action) => {
      const run = transactionTail.then(async () => {
        const writes = [];
        const result = await action({ get: (ref) => ref.get(), update: (ref, value) => writes.push(() => ref.update(value)), create: (ref, value) => writes.push(() => ref.create(value)) });
        for (const write of writes) await write();
        return result;
      });
      transactionTail = run.catch(() => {});
      return run;
    },
  };
}

function fixture(options = {}) {
  const db = fakeStore();
  const calls = [];
  const deps = {
    db,
    authorize: async (_uid, orgId) => { if (orgId !== 'org') throw new HttpsError('permission-denied', 'Wrong organization'); return { member: options.member || { scope: 'organization' } }; },
    assertProgram: async ({ programId }) => { if (programId !== 'program') throw new HttpsError('permission-denied', 'Wrong program'); return { program: { name: 'Sang Summit', status: options.archived ? 'archived' : 'published' } }; },
    assertEvent: async ({ eventId }) => { if (!['event-a', 'event-b'].includes(eventId)) throw new HttpsError('permission-denied', 'Wrong event'); },
    appleConfig: () => options.apple || null,
    send: async (devices, message) => {
      calls.push({ devices, message });
      return options.send ? options.send(devices, message) : devices.map(({ uid }) => ({ uid, accepted: true }));
    },
  };
  const service = createProgramNotifications(deps);
  function person(id, overrides = {}, deviceOverrides = {}) {
    const uid = overrides.sangUserId || `user-${id}`;
    const access = { orgId: 'org', programId: 'program', accessStatus: 'active', eventAccess: { 'event-a': { status: 'allowed', roleId: 'participant' } } };
    db.records.set(`peProgramPeople/${id}`, { ...access, kind: 'participant', programRoleId: 'participant', linkStatus: 'linked', sangUserId: uid, ...overrides });
    db.records.set(`users/${uid}/eventAccess/program`, { ...access, ...overrides });
    db.records.set(`devices/device-${id}`, { uid, active: true, notificationPermission: 'granted', platform: 'android', fcmToken: `token-${id}`, ...deviceOverrides });
    return uid;
  }
  const input = (audience = { mode: 'all' }) => ({ orgId: 'org', programId: 'program', title: 'Doors open', body: 'Join us at the main hall.', audience });
  const reference = (job) => ({ orgId: 'org', programId: 'program', notificationId: job.id });
  return { service, db, calls, deps, person, input, reference };
}

test('validates message lengths, required selections, safe IDs and deduplicates selections', () => {
  const f = fixture();
  assert.equal(notificationInputSchema.safeParse(f.input({ mode: 'people', personIds: [] })).success, false);
  assert.equal(notificationInputSchema.safeParse(f.input({ mode: 'events', eventIds: ['../event'] })).success, false);
  assert.equal(notificationInputSchema.safeParse({ ...f.input(), title: ' ' }).success, false);
  assert.equal(notificationInputSchema.safeParse({ ...f.input(), body: 'a'.repeat(501) }).success, false);
  assert.deepEqual(notificationInputSchema.parse(f.input({ mode: 'roles', roleIds: ['speaker', 'speaker'] })).audience.roleIds, ['speaker']);
});

test('preview excludes inactive, unlinked, stale app access and non-receiving devices; deduplicates', async () => {
  const f = fixture();
  f.person('one');
  f.person('duplicate', { sangUserId: 'user-one' }, { fcmToken: 'token-one' });
  f.person('blocked', { accessStatus: 'blocked' });
  f.person('removed', { accessStatus: 'removed' });
  f.person('unlinked', { linkStatus: 'pending' });
  f.person('stale'); f.db.records.delete('users/user-stale/eventAccess/program');
  f.person('disabled', {}, { active: false });
  f.person('denied', {}, { notificationPermission: 'denied' });
  f.person('iphone', {}, { platform: 'ios', fcmToken: 'a'.repeat(64) });
  f.person('outside', { orgId: 'another-org' });
  const job = await f.service.preview('admin', f.input());
  assert.deepEqual(job.counts, { matchedPeople: 9, inactivePeople: 2, unlinkedPeople: 1, duplicatePeople: 1, missingAccessUsers: 1, noDeviceUsers: 3, iosUnavailableDevices: 1, unsupportedDevices: 0, eligibleUsers: 1, deviceCount: 1, androidDevices: 1, iosDevices: 0 });
  assert.equal(f.calls.length, 0);
  assert.equal(JSON.stringify(job).includes('token-one'), false);
  assert.equal(JSON.stringify(job).includes('user-one'), false);
});

test('role, event-role and manual audiences select exactly their matching people', async () => {
  const f = fixture();
  f.person('participant');
  f.person('speaker', { programRoleId: 'speaker', eventAccess: { 'event-a': { status: 'allowed', roleId: 'speaker' } } });
  f.person('elsewhere', { eventAccess: { 'event-b': { status: 'allowed', roleId: 'speaker' } } });
  f.person('revoked', { eventAccess: { 'event-a': { status: 'revoked', roleId: 'speaker' } } });
  for (const audience of [{ mode: 'roles', roleIds: ['speaker'] }, { mode: 'events', eventIds: ['event-a'], eventRoleIds: ['speaker'] }, { mode: 'people', personIds: ['speaker'] }]) {
    const job = await f.service.preview('admin', f.input(audience));
    assert.equal(job.counts.eligibleUsers, 1);
    await f.service.send('admin', f.reference(job));
    assert.deepEqual(f.calls.at(-1).devices.map((device) => device.uid), ['user-speaker']);
  }
});

test('event access in both roster and mobile mirror must match the chosen event role', async () => {
  const f = fixture(); f.person('one');
  f.db.records.get('users/user-one/eventAccess/program').eventAccess = { 'event-a': { status: 'allowed', roleId: 'speaker' } };
  const job = await f.service.preview('admin', f.input({ mode: 'events', eventIds: ['event-a'], eventRoleIds: ['participant'] }));
  assert.equal(job.counts.eligibleUsers, 0);
  assert.equal(job.counts.missingAccessUsers, 1);
});

test('event coordinators cannot target other events or manually select people outside their event', async () => {
  const f = fixture({ member: { scope: 'event', programId: 'program', eventId: 'event-a' } });
  f.person('one'); f.person('other', { eventAccess: { 'event-b': { status: 'allowed' } } });
  assert.equal((await f.service.preview('admin', f.input())).counts.eligibleUsers, 1);
  await assert.rejects(f.service.preview('admin', f.input({ mode: 'events', eventIds: ['event-b'] })), { code: 'permission-denied' });
  await assert.rejects(f.service.preview('admin', f.input({ mode: 'people', personIds: ['other'] })), { code: 'permission-denied' });
});

test('authorization and ownership reject cross-organization, program, event and person IDs', async () => {
  const f = fixture(); f.person('one');
  await assert.rejects(f.service.preview('admin', { ...f.input(), orgId: 'other' }), { code: 'permission-denied' });
  await assert.rejects(f.service.preview('admin', { ...f.input(), programId: 'other' }), { code: 'permission-denied' });
  await assert.rejects(f.service.preview('admin', f.input({ mode: 'events', eventIds: ['outside'] })), { code: 'permission-denied' });
  await assert.rejects(f.service.preview('admin', f.input({ mode: 'people', personIds: ['outside'] })), { code: 'permission-denied' });
  const scoped = fixture({ member: { scope: 'program', programId: 'other' } });
  await assert.rejects(scoped.service.preview('admin', scoped.input()), { code: 'permission-denied' });
  f.deps.authorize = async () => { throw new HttpsError('permission-denied', 'No permission'); };
  await assert.rejects(f.service.preview('admin', f.input()), { code: 'permission-denied' });
});

test('iPhone devices are eligible only with Apple configuration and valid APNs tokens', async () => {
  const f = fixture({ apple: { bundleId: 'test' } });
  f.person('ios', {}, { platform: 'ios', fcmToken: 'a'.repeat(64) });
  f.person('invalid-ios', {}, { platform: 'ios', fcmToken: 'not-a-native-apns-token' });
  const job = await f.service.preview('admin', f.input());
  assert.equal(job.counts.iosDevices, 1);
  assert.equal(job.counts.unsupportedDevices, 1);
});

test('parallel sends and subsequent replays claim a notification only once and create one audit record', async () => {
  const f = fixture(); f.person('one');
  const job = await f.service.preview('admin', f.input());
  await Promise.all(Array.from({ length: 6 }, () => f.service.send('admin', f.reference(job))));
  const replay = await f.service.send('admin', f.reference(job));
  assert.equal(f.calls.length, 1);
  assert.equal(replay.status, 'sent');
  assert.equal(replay.result.acceptedUsers, 1);
  assert.equal([...f.db.records.keys()].filter((key) => key.startsWith('peAuditLogs/')).length, 1);
});

test('send refuses changed recipients or devices, expired previews, zero recipients and another author', async () => {
  for (const scenario of ['changed', 'expired', 'empty', 'owner']) {
    const f = fixture(); if (scenario !== 'empty') f.person('one');
    const job = await f.service.preview('admin', f.input());
    if (scenario === 'changed') f.db.records.get('devices/device-one').fcmToken = 'new-token';
    if (scenario === 'expired') f.db.records.get(`pePrograms/program/notifications/${job.id}`).expiresAt = Timestamp.fromMillis(0);
    await assert.rejects(f.service.send(scenario === 'owner' ? 'other-admin' : 'admin', f.reference(job)), { code: scenario === 'owner' ? 'permission-denied' : 'failed-precondition' });
    assert.equal(f.calls.length, 0);
  }
});

test('permissions are rechecked when sending an existing preview', async () => {
  const f = fixture(); f.person('one');
  const job = await f.service.preview('admin', f.input());
  f.deps.authorize = async () => { throw new HttpsError('permission-denied', 'Role removed'); };
  await assert.rejects(f.service.send('admin', f.reference(job)), { code: 'permission-denied' });
  assert.equal(f.calls.length, 0);
});

test('partial failures and ambiguous transport errors are recorded without retrying', async () => {
  for (const failure of ['partial', 'throw', 'uncertain', 'failed']) {
    const f = fixture({ send: async (devices) => {
      if (failure === 'throw') throw new Error('connection lost after acceptance');
      return devices.map(({ uid }, i) => ({ uid, accepted: failure === 'partial' && i === 0, uncertain: failure === 'uncertain' }));
    } });
    f.person('one'); f.person('two');
    const job = await f.service.preview('admin', f.input());
    const result = await f.service.send('admin', f.reference(job));
    assert.equal(result.status, failure === 'throw' ? 'uncertain' : failure);
    await f.service.send('admin', f.reference(job));
    assert.equal(f.calls.length, 1);
  }
});

test('history excludes drafts and limits event staff to their own sends', async () => {
  const f = fixture(); f.person('one');
  const first = await f.service.preview('admin', f.input());
  await f.service.send('admin', f.reference(first));
  const second = await f.service.preview('staff', f.input());
  await f.service.send('staff', f.reference(second));
  await f.service.preview('admin', f.input());
  assert.equal((await f.service.history('admin', { orgId: 'org', programId: 'program' })).notifications.length, 2);
  f.deps.authorize = async () => ({ member: { scope: 'event', programId: 'program', eventId: 'event-a' } });
  assert.deepEqual((await f.service.history('staff', { orgId: 'org', programId: 'program' })).notifications.map((job) => job.id), [second.id]);
  await assert.rejects(f.service.history('staff', f.reference(first)), { code: 'permission-denied' });
});

test('archived programs are rejected before a preview or send', async () => {
  const f = fixture({ archived: true });
  await assert.rejects(f.service.preview('admin', f.input()), { code: 'failed-precondition' });
});

test('an interrupted send becomes uncertain after ten minutes and is never sent again', async () => {
  const f = fixture(); f.person('one');
  const job = await f.service.preview('admin', f.input());
  Object.assign(f.db.records.get(`pePrograms/program/notifications/${job.id}`), { status: 'sending', startedAt: Timestamp.fromMillis(Date.now() - 11 * 60 * 1000) });
  const status = await f.service.history('admin', f.reference(job));
  assert.equal(status.notifications[0].status, 'uncertain');
  assert.equal((await f.service.send('admin', f.reference(job))).status, 'uncertain');
  assert.equal(f.calls.length, 0);
});

test('recipient limits fail explicitly instead of silently truncating', async () => {
  const f = fixture();
  for (let i = 0; i < 2001; i++) f.db.records.set(`peProgramPeople/${i}`, { orgId: 'org', programId: 'program' });
  await assert.rejects(f.service.preview('admin', f.input()), { code: 'resource-exhausted' });
  const g = fixture(); const uid = g.person('one');
  for (let i = 0; i < 101; i++) g.db.records.set(`devices/extra-${i}`, { uid });
  await assert.rejects(g.service.preview('admin', g.input()), { code: 'resource-exhausted' });
});
