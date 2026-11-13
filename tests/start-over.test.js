// Start over (Nov 13): a board's years, entries and budgets are wiped so it can be set up again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle, memoryProfiles, memoryUsage } from '../src/lib/api.js';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { boardVaultStores, memoryBoards } from '../src/lib/boards.js';
import { RateLimiter } from '../src/lib/security.js';

const ana = { id: 'u-ana', email: 'ana@example.com', name: 'Ana' };
const ben = { id: 'u-ben', email: 'ben@example.com', name: 'Ben' };
function setup() {
  const master = { active: 'v1', keys: { v1: randomBytes(32) } };
  const s = memoryStores();
  const boards = memoryBoards();
  const bs = boardVaultStores(boards);
  const deps = {
    vault: new Vault({ master, keys: s.keys, docs: s.docs }), boards, boardVault: new Vault({ master, keys: bs.keys, docs: bs.docs }),
    profiles: memoryProfiles(), usage: memoryUsage(), ai: { async complete() { return ''; } }, admins: new Set(['ana@example.com']), requireApproval: false,
    appOrigin: 'https://app.test', limiter: new RateLimiter(1000, 60_000), dailyReadCap: 30,
  };
  const call = async (method, path, user, body) => handle({ method, path, headers: { 'x-requested-with': 'costs-tracker', origin: 'https://app.test' }, body, user, authKind: 'cookie' }, deps);
  return { call };
}
const count = async (call, base, user, c) => (await call('GET', base + c, user)).body.docs.length;
const DATA = ['years', 'entries', 'budgets', 'budgetDefaults', 'overrides'];

test('personal board: every year, entry and budget goes, and the onboarding mark too; name and picture stay', async () => {
  const { call } = setup();
  for (const c of DATA) await call('POST', '/api/db/' + c, ana, { year: '2026', amount: 1 });
  await call('PUT', '/api/db/settings/onboarding', ana, { done: true });
  await call('PUT', '/api/db/settings/profile', ana, { firstName: 'Ana' });
  const r = await call('POST', '/api/me/start-over', ana);
  assert.equal(r.status, 200);
  for (const c of DATA) assert.equal(await count(call, '/api/db/', ana, c), 0, c);
  const settings = (await call('GET', '/api/db/settings', ana)).body.docs.map((d) => d.id);
  assert.deepEqual(settings, ['profile'], 'onboarding mark removed (the dashboard sends to /welcome), profile kept');
  // Writing again works: the user key was kept.
  assert.equal((await call('POST', '/api/db/years', ana, { year: '2026' })).status, 201);
});

test('shared board: co-owners start it over for everyone; name and members stay; editors and viewers cannot', async () => {
  const { call } = setup();
  const id = (await call('POST', '/api/boards', ana, { name: 'Casa' })).body.id;
  const base = `/api/boards/${id}/db/`;
  for (const c of DATA) await call('POST', base + c, ana, { year: '2026', amount: 1 });
  const inv = (await call('POST', `/api/boards/${id}/invites`, ana, { role: 'editor' })).body;
  assert.equal((await call('POST', '/api/invites/accept', ben, { token: inv.token })).status, 201);
  assert.equal((await call('POST', base + 'entries', ben, { item: 'Ben' })).status, 201, 'Ben is an editor');
  await call('DELETE', base + 'entries/' + (await call('GET', base + 'entries', ben)).body.docs.find((d) => d.data.item === 'Ben').id, ben);
  assert.equal((await call('POST', `/api/boards/${id}/start-over`, ben)).status, 403, 'editors cannot');
  assert.equal(await count(call, base, ana, 'entries'), 1);
  assert.equal((await call('GET', `/api/boards/${id}/start-over`, ana)).status, 405);
  assert.equal((await call('POST', `/api/boards/${id}/start-over`, ana)).status, 200);
  for (const c of DATA) assert.equal(await count(call, base, ana, c), 0, c);
  const b = (await call('GET', `/api/boards/${id}`, ana)).body;
  assert.deepEqual([b.name, b.members.length], ['Casa', 2]);
  assert.equal((await call('POST', `/api/boards/${id}/start-over`, { id: 'u-out', email: 'out@example.com' })).status, 404, 'outsiders see nothing');
});

test('starting a shared board over leaves the personal board alone, and the other way round', async () => {
  const { call } = setup();
  const id = (await call('POST', '/api/boards', ana, { name: 'Casa' })).body.id;
  await call('POST', '/api/db/entries', ana, { item: 'Mine' });
  await call('POST', `/api/boards/${id}/db/entries`, ana, { item: 'Ours' });
  await call('POST', `/api/boards/${id}/start-over`, ana);
  assert.equal(await count(call, '/api/db/', ana, 'entries'), 1);
  await call('POST', `/api/boards/${id}/db/entries`, ana, { item: 'Ours' });
  await call('POST', '/api/me/start-over', ana);
  assert.equal(await count(call, `/api/boards/${id}/db/`, ana, 'entries'), 1);
});
