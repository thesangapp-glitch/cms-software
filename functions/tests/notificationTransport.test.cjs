const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { createRequire } = require('node:module');
const { runInNewContext } = require('node:vm');
const { EventEmitter } = require('node:events');
const { generateKeyPairSync, verify } = require('node:crypto');
const path = require('node:path');
const { readApplePushConfig, programNotificationData } = require('../lib/notificationTransport');

const message = { orgId: 'org', programId: 'program', notificationId: 'notice', title: 'Doors open', body: 'Meet in the main hall.' };
// Replace both provider boundaries before evaluating the compiled transport.
// These tests never initialize Firebase or open an HTTP/2 connection.
function transport({ multicast, connect } = {}) {
  const file = path.resolve(__dirname, '../lib/notificationTransport.js');
  const realRequire = createRequire(file);
  const exports = {};
  runInNewContext(readFileSync(file, 'utf8'), {
    exports, Buffer, setTimeout, clearTimeout,
    require: (name) => name === 'firebase-admin/messaging' ? { getMessaging: () => ({ sendEachForMulticast: multicast }) }
      : name === 'node:http2' ? { connect: connect || (() => { throw new Error('Unexpected Apple send'); }) } : realRequire(name),
  });
  return exports;
}

test('uses the existing mobile event routing payload', () => {
  assert.deepEqual(programNotificationData(message), { type: 'event_program_access', orgId: 'org', programId: 'program', notificationId: 'notice', url: 'sang://events/program' });
});

test('Android transport splits at 500, uses the existing channel and maps provider results', async () => {
  const batches = [];
  const sender = transport({ multicast: async (batch) => { batches.push(batch); return { responses: batch.tokens.map((_, i) => ({ success: i !== 0, ...(i === 0 ? { error: { code: 'messaging/invalid-registration-token' } } : {}) })) }; } });
  const devices = Array.from({ length: 501 }, (_, i) => ({ uid: `user-${i}`, platform: 'android', token: `token-${i}` }));
  const results = await sender.sendProgramPush(devices, message, null);
  assert.deepEqual(batches.map((batch) => batch.tokens.length), [500, 1]);
  assert.equal(batches[0].android.notification.channelId, 'connections');
  assert.equal(batches[0].data.programId, 'program');
  assert.equal(batches[0].notification.body, message.body);
  assert.equal(results.length, 501);
  assert.equal(results[0].accepted, false);
  assert.equal(results[1].accepted, true);
});

test('unknown Firebase request results are marked uncertain without a transport retry', async () => {
  let calls = 0;
  const sender = transport({ multicast: async () => { calls++; throw new Error('connection failed'); } });
  const results = await sender.sendProgramPush([{ uid: 'user', platform: 'android', token: 'test' }], message, null);
  assert.equal(calls, 1);
  assert.equal(results[0].uncertain, true);
  assert.equal(results[0].accepted, false);
});

test('Apple configuration requires an EC P-256 signing key', () => {
  assert.equal(readApplePushConfig(undefined), null);
  assert.equal(readApplePushConfig('{}'), null);
  assert.equal(readApplePushConfig('invalid json'), null);
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  const config = { keyId: 'key', teamId: 'team', bundleId: 'com.test.sang', environment: 'production', privateKey };
  assert.deepEqual(readApplePushConfig(JSON.stringify(config)), config);
  assert.equal(readApplePushConfig(JSON.stringify({ ...config, privateKey: 'broken-key' })), null);
});

test('Apple transport signs a valid JWT and sends the same event routing data with an alert', async () => {
  const keys = generateKeyPairSync('ec', { namedCurve: 'prime256v1', privateKeyEncoding: { type: 'pkcs8', format: 'pem' }, publicKeyEncoding: { type: 'spki', format: 'pem' } });
  let headers, payload, destroyed = false;
  const sender = transport({ connect: (endpoint) => {
    assert.equal(endpoint, 'https://api.sandbox.push.apple.com');
    const session = new EventEmitter();
    session.request = (input) => {
      headers = input;
      const request = new EventEmitter();
      request.setTimeout = () => {};
      request.resume = () => {};
      request.end = (body) => { payload = JSON.parse(body); queueMicrotask(() => request.emit('response', { ':status': 200 })); };
      return request;
    };
    session.destroy = () => { destroyed = true; };
    return session;
  } });
  const config = { keyId: 'key', teamId: 'team', bundleId: 'com.test.sang', environment: 'sandbox', privateKey: keys.privateKey };
  const result = await sender.sendProgramPush([{ uid: 'user', platform: 'ios', token: 'a'.repeat(64) }], message, config);
  assert.equal(result[0].accepted, true);
  assert.equal(destroyed, true);
  assert.equal(headers['apns-topic'], config.bundleId);
  assert.equal(headers['apns-push-type'], 'alert');
  assert.equal(payload.type, 'event_program_access');
  assert.equal(payload.programId, 'program');
  assert.equal(payload.aps.alert.title, message.title);
  const [header, claims, signature] = headers.authorization.slice('bearer '.length).split('.');
  assert.equal(JSON.parse(Buffer.from(claims, 'base64url')).iss, 'team');
  assert.equal(verify('sha256', Buffer.from(`${header}.${claims}`), { key: keys.publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(signature, 'base64url')), true);
});
