// Run against Vite with Playwright installed separately; all Firebase calls and
// non-local network requests are intercepted. No notification can leave this test.
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('**/*', (route) => new URL(route.request().url()).hostname === '127.0.0.1' ? route.fallback() : route.abort());
  await page.route('**/src/lib/firebase.ts*', (route) => route.fulfill({ contentType: 'application/javascript', body: 'export const functions = {};' }));
  await page.route('**/node_modules/.vite/deps/firebase_functions.js*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `export const httpsCallable = (_, name) => async (input) => {
      window.__calls.push({ name, input: structuredClone(input) });
      if (name === 'previewProgramNotification') {
        const id = 'preview-' + Object.keys(window.__jobs).length;
        const job = { ...structuredClone(input), id, programName: 'Sang Summit', status: 'draft',
          counts: { matchedPeople: 100, inactivePeople: 1, unlinkedPeople: 2, duplicatePeople: 1,
            missingAccessUsers: 1, noDeviceUsers: 2, iosUnavailableDevices: 1, unsupportedDevices: 0,
            eligibleUsers: window.__zero ? 0 : 2, deviceCount: window.__zero ? 0 : 3, androidDevices: window.__zero ? 0 : 3, iosDevices: 0 },
          result: null, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now() + 600000).toISOString(), finishedAt: '' };
        window.__jobs[id] = job;
        return { data: job };
      }
      if (name === 'sendProgramNotification') {
        await new Promise(resolve => setTimeout(resolve, 100));
        if (window.__sendMode === 'stale') throw Object.assign(new Error('The audience changed. Review again.'), { code: 'functions/failed-precondition' });
        if (window.__sendMode === 'network-before') throw Object.assign(new Error('Connection lost'), { code: 'functions/unavailable' });
        const job = window.__jobs[input.notificationId];
        job.status = 'sent'; job.result = { acceptedUsers: 2, acceptedDevices: 3, failedDevices: 0, uncertainDevices: 0 };
        if (window.__sendMode === 'network-after') throw Object.assign(new Error('Response lost'), { code: 'functions/unavailable' });
        return { data: structuredClone(job) };
      }
      if (name === 'listProgramNotifications') {
        if (window.__historyInternal) throw Object.assign(new Error('internal'), { code: 'functions/internal' });
        return { data: { notifications: input.notificationId ? [window.__jobs[input.notificationId]] : Object.values(window.__jobs).filter(job => job.status !== 'draft') } };
      }
      throw new Error('Unexpected callable: ' + name);
    };`,
  }));
  await page.route('**/src/main.tsx*', (route) => route.fulfill({
    contentType: 'application/javascript',
    body: `import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import NotificationsPage from '/src/NotificationsPage.tsx';
      import '/src/index.css';
      window.__calls = []; window.__jobs = {}; window.__sendMode = ''; window.__zero = false;
      const people = Array.from({ length: 100 }, (_, i) => ({ id: 'person-' + i, programId: 'program', fullName: 'Person ' + String(i).padStart(3, '0'), email: 'person' + i + '@example.test', kind: 'participant', programRoleId: 'participant', accessStatus: 'active' }));
      people.push({ ...people[0], id: 'blocked', fullName: 'Blocked Person', accessStatus: 'blocked' });
      people.push({ ...people[0], id: 'removed', fullName: 'Removed Person', accessStatus: 'removed' });
      people.push({ ...people[0], id: 'other', fullName: 'Other Program Person', programId: 'other' });
      const props = { orgId: 'org', program: { id: 'program', name: 'Sang Summit' }, people,
        events: [{ id: 'talk', programId: 'program', name: 'Opening talk' }, { id: 'workshop', programId: 'program', name: 'Design workshop' }, { id: 'other', programId: 'other', name: 'Other event' }],
        roles: [{ id: 'participant', name: 'Participant' }, { id: 'speaker', name: 'Speaker' }] };
      const root = ReactDOM.createRoot(document.getElementById('root'));
      document.getElementById('root').style.padding = '24px';
      window.__render = (patch = {}) => root.render(React.createElement(NotificationsPage, { ...props, ...patch }));
      window.__render();`,
  }));
  const review = () => page.getByRole('button', { name: 'Review audience and message' });
  const dialog = () => page.getByRole('dialog');
  const waitClosed = () => dialog().waitFor({ state: 'hidden' });
  const latestPreview = () => page.evaluate(() => window.__calls.filter((call) => call.name === 'previewProgramNotification').at(-1).input);
  try {
    await page.goto('http://127.0.0.1:5173/');
    await page.getByRole('heading', { name: 'Notifications', exact: true }).waitFor();
    await page.evaluate(() => { window.__historyInternal = true; });
    await page.getByRole('button', { name: 'Refresh history' }).click();
    await page.getByRole('alert').getByText('The notification service could not complete this request.', { exact: false }).waitFor();
    await page.evaluate(() => { window.__historyInternal = false; });
    await page.getByRole('button', { name: 'Refresh history' }).click();
    await page.getByRole('alert').waitFor({ state: 'hidden' });
    assert.equal(await review().isDisabled(), true);
    await page.getByLabel('Title').fill('Workshop starts at 10 AM');
    await page.getByLabel('Message', { exact: false }).fill('Please arrive at Hall A ten minutes early.');

    await page.getByRole('combobox', { name: 'Audience' }).selectOption('roles');
    assert.equal(await review().isDisabled(), true);
    await page.getByRole('checkbox', { name: 'Participant', exact: true }).check();
    await review().click(); await dialog().waitFor();
    assert.deepEqual((await latestPreview()).audience.roleIds, ['participant']);
    assert.ok(await dialog().getByText('iPhone notification delivery is not configured.', { exact: false }).isVisible());
    await page.keyboard.press('Escape'); await waitClosed();
    assert.equal(await page.evaluate(() => window.__calls.filter((call) => call.name === 'sendProgramNotification').length), 0);

    await page.getByRole('combobox', { name: 'Audience' }).selectOption('events');
    assert.equal(await review().isDisabled(), true);
    assert.equal(await page.getByRole('checkbox', { name: 'Other event' }).count(), 0);
    await page.getByRole('checkbox', { name: 'Design workshop' }).check();
    await page.getByText('Filter by role in these events', { exact: true }).click();
    await page.getByRole('checkbox', { name: 'Participant', exact: true }).check();
    await review().click(); await dialog().waitFor();
    assert.deepEqual((await latestPreview()).audience.eventIds, ['workshop']);
    assert.deepEqual((await latestPreview()).audience.eventRoleIds, ['participant']);
    await dialog().getByRole('button', { name: 'Back', exact: true }).click();

    await page.getByRole('combobox', { name: 'Audience' }).selectOption('people');
    assert.equal(await page.getByRole('checkbox').count(), 100);
    await page.getByRole('button', { name: 'Select all matching', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search notification audience' }).fill('Person 00');
    await page.getByText('100 selected · 90 outside current filters', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Deselect matching' }).click();
    await page.getByText('90 selected · 90 outside current filters', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear', exact: true }).click();
    await page.getByRole('button', { name: 'Select all matching', exact: true }).click();
    await review().click(); await dialog().waitFor();
    assert.equal((await latestPreview()).audience.personIds.length, 10);
    await page.screenshot({ path: path.join(os.tmpdir(), 'sang-notification-review.png'), animations: 'disabled' });
    await dialog().getByRole('button', { name: 'Send to 2 people', exact: true }).click();
    await waitClosed();
    await page.getByRole('status').getByText('Accepted by push service.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.__calls.filter((call) => call.name === 'sendProgramNotification').length), 1);
    await page.locator('.notification-history-item').waitFor();

    // Unknown response: preserve the preview ID and block new sends until checked.
    await page.evaluate(() => { window.__sendMode = 'network-before'; });
    await review().click(); await dialog().waitFor();
    await dialog().getByRole('button', { name: 'Send to 2 people', exact: true }).click(); await waitClosed();
    assert.equal(await review().isDisabled(), true);
    const pending = await page.evaluate(() => sessionStorage.getItem('sang-notification:org:program'));
    assert.ok(pending);
    await page.getByRole('button', { name: 'Check send status' }).click(); await dialog().waitFor();
    await page.evaluate(() => { window.__sendMode = ''; });
    await dialog().getByRole('button', { name: 'Send to 2 people', exact: true }).click(); await waitClosed();
    assert.equal(await page.evaluate(() => window.__calls.filter((call) => call.name === 'sendProgramNotification').at(-1).input.notificationId), pending);

    // A response lost after acceptance is resolved through history without resend.
    await page.evaluate(() => { window.__sendMode = 'network-after'; });
    await review().click(); await dialog().waitFor();
    await dialog().getByRole('button', { name: 'Send to 2 people', exact: true }).click(); await waitClosed();
    const beforeCheck = await page.evaluate(() => window.__calls.filter((call) => call.name === 'sendProgramNotification').length);
    await page.getByRole('button', { name: 'Check send status' }).click();
    await page.locator('.notification-pending').waitFor({ state: 'hidden' });
    assert.equal(await page.evaluate(() => window.__calls.filter((call) => call.name === 'sendProgramNotification').length), beforeCheck);

    await page.evaluate(() => { window.__sendMode = 'stale'; });
    await review().click(); await dialog().waitFor();
    await dialog().getByRole('button', { name: 'Send to 2 people', exact: true }).click(); await waitClosed();
    await page.getByRole('alert').getByText('The audience changed. Review again.').waitFor();
    assert.equal(await review().isDisabled(), false);

    await page.evaluate(() => { window.__zero = true; });
    await review().click(); await dialog().waitFor();
    assert.equal(await dialog().getByRole('button', { name: 'Send to 0 people' }).isDisabled(), true);
    await dialog().getByRole('button', { name: 'Back', exact: true }).click();
    await page.getByRole('searchbox', { name: 'Search notification audience' }).fill('');
    await page.screenshot({ path: path.join(os.tmpdir(), 'sang-notifications-desktop.png'), fullPage: true, animations: 'disabled' });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: path.join(os.tmpdir(), 'sang-notifications-mobile.png'), fullPage: true, animations: 'disabled' });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
    await review().click(); await dialog().waitFor();
    const box = await dialog().boundingBox();
    assert.ok(box.x >= 0 && box.x + box.width <= 390 && box.y >= 0 && box.y + box.height <= 844);
    await dialog().getByRole('button', { name: 'Back', exact: true }).click();
    await page.evaluate(() => window.__render({ scopedEventId: 'talk' }));
    await page.getByRole('combobox', { name: 'Audience' }).selectOption('events');
    assert.equal(await page.getByRole('checkbox', { name: 'Design workshop' }).count(), 0);
    assert.equal(await page.getByRole('checkbox', { name: 'Opening talk' }).count(), 1);
    assert.deepEqual(errors, []);
    console.log('PASS: audience modes, 100-person selection, review, exclusions, history, recovery, mobile layout and event scope. No real sends.');
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
