import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle, memoryAccounts, memoryProfiles, memoryUsage, passwordProblem, pageAccess } from '../src/lib/api.js';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { RateLimiter, parseAdminEmails, passesCsrf, passesFormCsrf, effectiveStatus } from '../src/lib/security.js';

const ORIGIN = 'https://app.test';
function setup(cap = 3) {
  const s = memoryStores();
  const calls = [];
  const deps = {
    vault: new Vault({ master: { active: 'v1', keys: { v1: randomBytes(32) } }, keys: s.keys, docs: s.docs }),
    profiles: memoryProfiles(), usage: memoryUsage(),
    ai: { async complete(a) { calls.push(a); return '{"ok":true}'; } },
    admins: parseAdminEmails('Boss@Example.com'), appOrigin: ORIGIN,
    limiter: new RateLimiter(100, 60000), dailyReadCap: cap,
  };
  const call = (method, path, user, body, extra = {}) => handle({
    method, path, user, body,
    headers: { 'x-requested-with': 'costs-tracker', origin: ORIGIN, ...extra },
  }, deps);
  return { deps, call, calls, s };
}
const boss = { id: 'u-boss', email: 'boss@example.com' };
const ann = { id: 'u-ann', email: 'ann@example.com' };
const bob = { id: 'u-bob', email: 'bob@example.com' };

test('anonymous -> 401; cross-site write -> 403', async () => {
  const { call, deps } = setup();
  assert.equal((await call('GET', '/api/db/entries', null)).status, 401);
  const r = await handle({ method: 'POST', path: '/api/db/entries', user: boss, body: {}, headers: { origin: 'https://evil.test', 'x-requested-with': 'costs-tracker' } }, deps);
  assert.equal(r.status, 403);
  const r2 = await handle({ method: 'POST', path: '/api/db/entries', user: boss, body: {}, headers: { origin: ORIGIN } }, deps);
  assert.equal(r2.status, 403);
});

test('new users are pending: no data access until an admin approves', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/me', ann)).body.status, 'pending');
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 403);
  assert.equal((await call('POST', '/api/db/entries', ann, { a: 1 })).status, 403);
  assert.equal((await call('GET', '/api/admin/users', ann)).status, 403);
  assert.equal((await call('POST', '/api/admin/users/u-ann/approve', ann)).status, 403);
  // Admin approves
  assert.equal((await call('GET', '/api/me', boss)).body.status, 'approved');
  assert.equal((await call('POST', '/api/admin/users/u-ann/approve', boss)).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 200);
  assert.equal((await call('POST', '/api/admin/users/u-ann/block', boss)).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 403);
});

test('users only ever see their own documents', async () => {
  const { call } = setup();
  await call('GET', '/api/me', ann); await call('GET', '/api/me', bob);
  await call('POST', '/api/admin/users/u-ann/approve', boss); await call('POST', '/api/admin/users/u-bob/approve', boss);
  const a = await call('POST', '/api/db/entries', ann, { amount: 1, item: 'ann-secret' });
  assert.equal(a.status, 201);
  assert.equal((await call('GET', '/api/db/entries', bob)).body.docs.length, 0);
  assert.equal((await call('DELETE', `/api/db/entries/${a.body.id}`, bob)).status, 200); // no-op for bob
  assert.equal((await call('GET', '/api/db/entries', ann)).body.docs.length, 1);
  assert.equal((await call('PUT', `/api/db/entries/${a.body.id}`, ann, { amount: 2 })).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).body.docs[0].data.amount, 2);
});

test('bad collection and ids are 400; internals are not leaked', async () => {
  const { call } = setup();
  assert.equal((await call('GET', '/api/db/secrets', boss)).status, 400);
  assert.equal((await call('POST', '/api/db/entries', boss, [1])).status, 400);
  assert.equal((await call('GET', '/api/nothing', boss)).status, 404);
});

test('read-document: validates, caps daily use, and never stores the receipt', async () => {
  const { call, calls, s } = setup(2);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: '' })).status, 400);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'x', images: [{ mediaType: 'image/svg+xml', data: 'a' }] })).status, 400);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'x', images: Array(7).fill({ mediaType: 'image/png', data: 'a' }) })).status, 400);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'RECEIPT-TEXT' })).status, 200);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'again' })).status, 200);
  assert.equal((await call('POST', '/api/read-document', boss, { prompt: 'third' })).status, 429);
  assert.equal(calls.length, 2);
  assert.ok(![...s.docMap.values()].some((r) => JSON.stringify(r).includes('RECEIPT-TEXT')));
});

test('erase removes data and blocks the account', async () => {
  const { call } = setup();
  await call('POST', '/api/db/entries', boss, { a: 1 });
  assert.equal((await call('DELETE', '/api/me', boss)).status, 200);
});

test('data erase removes every document but keeps the account usable', async () => {
  const { call } = setup();
  await call('POST', '/api/db/entries', boss, { a: 1 });
  assert.equal((await call('DELETE', '/api/me/data', boss)).status, 200);
  const after = await call('GET', '/api/db/entries', boss);
  assert.equal(after.status, 200);
  assert.equal(JSON.stringify(after.body).includes('"a":1'), false);
  assert.equal((await call('GET', '/api/me', boss)).body.status, 'approved');
  assert.equal((await call('POST', '/api/db/entries', boss, { b: 2 })).status < 300, true);
});

test('data erase keeps account settings (name, picture)', async () => {
  const { call } = setup();
  await call('PUT', '/api/db/settings/profile', boss, { firstName: 'Bo', lastName: 'Ss' });
  await call('POST', '/api/db/entries', boss, { a: 1 });
  assert.equal((await call('DELETE', '/api/me/data', boss)).status, 200);
  const settings = (await call('GET', '/api/db/settings', boss)).body.docs;
  assert.deepEqual(settings.map((d) => [d.id, d.data.firstName]), [['profile', 'Bo']]);
  assert.equal((await call('GET', '/api/db/entries', boss)).body.docs.length, 0);
});

test('sign-in method: code by default, set a password, change it with the current one, back to codes', async () => {
  const { call, deps } = setup();
  deps.accounts = memoryAccounts(deps.profiles);
  assert.deepEqual((await call('GET', '/api/account/sign-in', boss)).body, { method: 'code' });
  assert.equal((await call('POST', '/api/account/sign-in', boss, { method: 'password', password: 'short' })).body.error.code, 'weak_password');
  assert.equal((await call('POST', '/api/account/sign-in', boss, { method: 'password', password: 'first-password' })).status, 200);
  assert.equal(await deps.accounts.methodForEmail('BOSS@example.com'), 'password');
  // changing needs the current password
  assert.equal((await call('POST', '/api/account/sign-in', boss, { method: 'password', password: 'second-password' })).body.error.code, 'wrong_password');
  assert.equal((await call('POST', '/api/account/sign-in', boss, { method: 'password', current: 'nope-nope', password: 'second-password' })).body.error.code, 'wrong_password');
  assert.equal((await call('POST', '/api/account/sign-in', boss, { method: 'password', current: 'first-password', password: 'second-password' })).status, 200);
  assert.equal(await deps.accounts.checkPassword('boss@example.com', 'second-password'), true);
  assert.deepEqual((await call('POST', '/api/account/sign-in', boss, { method: 'code' })).body, { method: 'code' });
  assert.equal(await deps.accounts.checkPassword('boss@example.com', 'second-password'), false);
  assert.equal((await call('POST', '/api/account/sign-in', boss, { method: 'magic' })).status, 400);
  assert.equal(passwordProblem('x'.repeat(73)), 'Use at most 72 characters');
});

test('sign-in method: 501 without account support; pending users cannot use it', async () => {
  const { call, deps } = setup();
  assert.equal((await call('GET', '/api/account/sign-in', boss)).status, 501);
  deps.accounts = memoryAccounts(deps.profiles);
  assert.equal((await call('GET', '/api/account/sign-in', ann)).status, 403);
});

test('delete account with account support: data erased and the login deleted (profile gone)', async () => {
  const { call, deps, s } = setup();
  deps.accounts = memoryAccounts(deps.profiles);
  await call('POST', '/api/db/entries', boss, { a: 1 });
  const r = await call('DELETE', '/api/me', boss);
  assert.deepEqual(r.body, { erased: true, deleted: true });
  assert.equal(await deps.profiles.get(boss.id), null);
  assert.ok(![...s.docMap.values()].some((x) => x.user_id === boss.id));
});

test('helpers', () => {
  assert.equal(passesCsrf({ method: 'GET', headers: {} }, ORIGIN), true);
  assert.equal(passesCsrf({ method: 'POST', headers: { 'x-requested-with': 'costs-tracker', 'sec-fetch-site': 'cross-site' } }, ORIGIN), false);
  assert.equal(effectiveStatus({ email: 'BOSS@example.com' }, parseAdminEmails('boss@example.com')), 'approved');
  assert.equal(effectiveStatus({ email: 'x@y.z', status: 'blocked' }, new Set()), 'blocked');
  const l = new RateLimiter(2, 1000);
  assert.deepEqual([l.take('k', 0), l.take('k', 1), l.take('k', 2), l.take('k', 1001)], [true, true, false, true]);
});

test('doc ids produced by the app (with . : @ + ~) are accepted; traversal-ish ids are not', async () => {
  const { call } = setup();
  const id = 'budgetDefaults__expense__Fixed__Habitation__Rent-or-mortgage.v1~a:b@c+d';
  assert.equal((await call('PUT', `/api/db/budgetDefaults/${id}`, boss, { amount: 1 })).status, 200);
  assert.equal((await call('PUT', '/api/db/budgetDefaults/..', boss, { amount: 1 })).status, 400);
  assert.equal((await call('PUT', `/api/db/budgetDefaults/${'a'.repeat(201)}`, boss, { amount: 1 })).status, 400);
  assert.equal((await call('PUT', '/api/db/budgetDefaults/a%2Fb', boss, { amount: 1 })).status, 400);
});

test('percent-encoded ids (as sent by the browser) are decoded before validation', async () => {
  const { call } = setup();
  const raw = 'budgetDefaults__expense__Fixed__Rent-or-mortgage.v1~a:b@c+d';
  assert.equal((await call('PUT', `/api/db/budgetDefaults/${encodeURIComponent(raw)}`, boss, { amount: 1 })).status, 200);
  const list = (await call('GET', '/api/db/budgetDefaults', boss)).body.docs;
  assert.equal(list[0].id, raw);
  assert.equal((await call('DELETE', `/api/db/budgetDefaults/${encodeURIComponent(raw)}`, boss)).status, 200);
  assert.equal((await call('GET', '/api/db/budgetDefaults', boss)).body.docs.length, 0);
  assert.equal((await call('PUT', '/api/db/budgetDefaults/%E0%A4%A', boss, { a: 1 })).status, 400);
});

test('form CSRF: works when the browser sends Origin: null but Sec-Fetch-Site: same-origin; refuses cross-site', () => {
  assert.equal(passesFormCsrf({ method: 'POST', headers: { origin: 'null', 'sec-fetch-site': 'same-origin' } }, ORIGIN), true);
  assert.equal(passesFormCsrf({ method: 'POST', headers: { origin: ORIGIN } }, ORIGIN), true);
  assert.equal(passesFormCsrf({ method: 'POST', headers: { origin: 'https://evil.test', 'sec-fetch-site': 'cross-site' } }, ORIGIN), false);
  assert.equal(passesFormCsrf({ method: 'POST', headers: { origin: 'null' } }, ORIGIN), false);
  assert.equal(passesFormCsrf({ method: 'GET', headers: { 'sec-fetch-site': 'same-origin' } }, ORIGIN), false);
});

test('import commit: validates every row, creates missing years, saves in bulk, per-user', async () => {
  const { call } = setup();
  const good = { date: '2024-03-14', type: 'expense', group: 'Variable', category: 'Food', item: 'Supermarket', description: 'Mercadona', amount: 12.345, extra: 'dropped' };
  const inc = { date: '2025-01-31', type: 'income', group: 'X', category: 'Y', item: 'Salary', description: 'Nomina', amount: 2000 };
  await call('POST', '/api/db/years', boss, { year: '2025', currency: 'EUR' });
  const bad = await call('POST', '/api/import/commit', boss, { entries: [good, { ...good, date: '2024-02-30' }, { ...good, amount: -1, type: 'expense', group: 'Nope' }] });
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.rows, [{ index: 1, problems: ['date'] }, { index: 2, problems: ['category', 'amount'] }]);
  assert.equal((await call('GET', '/api/db/entries', boss)).body.docs.length, 0, 'nothing saved when any row is invalid');
  const ok = await call('POST', '/api/import/commit', boss, { entries: [good, inc] });
  assert.equal(ok.status, 201);
  assert.deepEqual(ok.body, { saved: 2, yearsCreated: ['2024'] });
  const docs = (await call('GET', '/api/db/entries', boss)).body.docs.map((d) => d.data);
  const g = docs.find((d) => d.item === 'Supermarket');
  assert.deepEqual([g.year, g.monthIndex, g.amount, g.source, g.extra], ['2024', 2, 12.35, 'import', undefined]);
  const i = docs.find((d) => d.item === 'Salary');
  assert.deepEqual([i.group, i.category], [null, null]);
  assert.deepEqual((await call('GET', '/api/db/years', boss)).body.docs.map((d) => d.data.year).sort(), ['2024', '2025']);
  assert.equal((await call('POST', '/api/import/commit', boss, { entries: [] })).status, 400);
  assert.equal((await call('POST', '/api/import/commit', boss, { entries: Array(501).fill(good) })).status, 400);
  assert.equal((await call('POST', '/api/import/commit', ann, { entries: [good] })).status, 403, 'pending users cannot import');
});

test('profile status is cached per request burst but approvals apply at once', async () => {
  const { call, deps } = setup();
  let reads = 0; const get = deps.profiles.get; deps.profiles.get = async (id) => { reads++; return get(id); };
  await call('GET', '/api/me', ann);
  await call('GET', '/api/me', ann); await call('GET', '/api/me', ann);
  assert.ok(reads <= 2, `profile read ${reads} times`);
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 403);
  assert.equal((await call('POST', '/api/admin/users/u-ann/approve', boss)).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 200, 'approval is visible immediately');
});

test('native app: bearer-authenticated writes skip the cookie CSRF check; cookie writes still need it', async () => {
  const { deps } = setup();
  const noCsrf = { method: 'POST', path: '/api/db/entries', user: boss, body: { a: 1 }, headers: {} };
  assert.equal((await handle(noCsrf, deps)).status, 403);
  assert.equal((await handle({ ...noCsrf, authKind: 'cookie' }, deps)).status, 403);
  const r = await handle({ ...noCsrf, authKind: 'bearer' }, deps);
  assert.equal(r.status, 201);
  assert.equal((await handle({ ...noCsrf, authKind: 'bearer', user: null }, deps)).status, 401);
});

// Oct 4: open sign-up (production default, REQUIRE_APPROVAL unset): a new account is approved at once; admins can still block.
test('open sign-up: new users are approved on their first request; a blocked one stays out', async () => {
  const { call, deps } = setup();
  deps.requireApproval = false;
  assert.equal((await call('GET', '/api/me', ann)).body.status, 'approved');
  assert.equal((await deps.profiles.get('u-ann')).status, 'approved', 'stored as approved, so turning approval back on keeps them in');
  assert.equal((await call('POST', '/api/db/entries', ann, { a: 1 })).status, 201);
  assert.equal((await call('GET', '/api/admin/users', ann)).status, 403, 'still not an admin');
  assert.equal((await call('POST', '/api/admin/users/u-ann/block', boss)).status, 200);
  assert.equal((await call('GET', '/api/db/entries', ann)).status, 403);
  assert.equal(await pageAccess(ann, deps), 'blocked');
  assert.equal(await pageAccess(bob, deps), 'ok');
});
