import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { handle, memoryProfiles, memoryUsage } from '../src/lib/api.js';
import { Vault, memoryStores } from '../src/lib/vault.js';
import { RateLimiter, parseAdminEmails } from '../src/lib/security.js';
import { boardVaultStores, cleanBoardName, hashToken, memoryBoards, MAX_BOARDS_PER_USER } from '../src/lib/boards.js';

// Oct 11: shared boards — a third board with its own data key, members with roles, invite links.
const ORIGIN = 'https://app.test';
function setup({ mailer = true } = {}) {
  const s = memoryStores(), boards = memoryBoards();
  const master = { active: 'v1', keys: { v1: randomBytes(32) } };
  const bs = boardVaultStores(boards);
  const outbox = [];
  const deps = {
    vault: new Vault({ master, keys: s.keys, docs: s.docs }),
    boards, boardVault: new Vault({ master, keys: bs.keys, docs: bs.docs }),
    mailer: mailer ? { async send(m) { outbox.push(m); } } : null,
    profiles: memoryProfiles(), usage: memoryUsage(), ai: { async complete() { return ''; } },
    admins: parseAdminEmails(''), requireApproval: false, appOrigin: ORIGIN, limiter: new RateLimiter(1000, 60000), dailyReadCap: 5,
  };
  const call = (method, path, user, body) => handle({ method, path, user, body, headers: { 'x-requested-with': 'costs-tracker', origin: ORIGIN } }, deps);
  return { deps, call, boards, s, outbox };
}
const ana = { id: 'u-ana', email: 'ana@example.com', name: 'Ana' };
const ben = { id: 'u-ben', email: 'ben@example.com', name: 'Ben' };
const cai = { id: 'u-cai', email: 'cai@example.com' };
const dee = { id: 'u-dee', email: 'dee@example.com' };

async function boardWith(call, owner = ana, name = 'Casa') {
  const r = await call('POST', '/api/boards', owner, { name });
  assert.equal(r.status, 201);
  return r.body.id;
}
async function invite(call, boardId, role, by = ana, extra = {}) {
  const r = await call('POST', `/api/boards/${boardId}/invites`, by, { role, ...extra });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  return r.body;
}
const join = (call, user, token) => call('POST', '/api/invites/accept', user, { token });

test('creating a board: the creator is its co-owner; it sits next to their personal board', async () => {
  const { call } = setup();
  await call('POST', '/api/db/entries', ana, { item: 'Personal rent', amount: 900 });
  const id = await boardWith(call);
  const list = (await call('GET', '/api/boards', ana)).body.boards;
  assert.deepEqual(list.map((b) => [b.id, b.name, b.role, b.members]), [[id, 'Casa', 'co_owner', 1]]);
  await call('POST', `/api/boards/${id}/db/entries`, ana, { item: 'Joint rent', amount: 1200 });
  assert.deepEqual((await call('GET', '/api/db/entries', ana)).body.docs.map((d) => d.data.item), ['Personal rent'], 'personal board untouched');
  assert.deepEqual((await call('GET', `/api/boards/${id}/db/entries`, ana)).body.docs.map((d) => d.data.item), ['Joint rent']);
  assert.equal((await call('POST', '/api/boards', ana, { name: '   ' })).status, 400);
  assert.equal(cleanBoardName(' Casa\n  Nova '), 'Casa Nova');
});

test('a board has its own key: its rows are not readable as anyone\'s personal data', async () => {
  const { call, boards, s } = setup();
  const id = await boardWith(call);
  await call('POST', `/api/boards/${id}/db/entries`, ana, { item: 'Secret', amount: 1 });
  const row = [...boards.docMap.values()].find((r) => r.collection === 'entries');
  assert.ok(row && !row.payload.includes('Secret'), 'stored encrypted');
  assert.ok(boards.keyMap.has(id) && !s.keyMap.has(id), 'key in the board key store');
  // A board row copied into a person's documents does not decrypt there (AAD binds it to the board).
  s.docMap.set(`u-ana\u0000entries\u0000${row.doc_id}`, { ...row, user_id: 'u-ana' });
  const r = await call('GET', '/api/db/entries', ana);
  assert.equal(r.status, 500);
});

test('invite link: viewer reads only, editor writes, co-owner manages; the token is stored hashed', async () => {
  const { call, boards } = setup();
  const id = await boardWith(call);
  const v = await invite(call, id, 'viewer');
  assert.match(v.url, /^https:\/\/app\.test\/join#[A-Za-z0-9_-]{43}$/);
  assert.ok(v.share.includes('Ana invited you to view “Casa” on Ongatu: https://app.test/join#'));
  assert.ok([...boards.invitesMap.values()].every((i) => i.token_hash === hashToken(v.token) && !JSON.stringify(i).includes(v.token)));
  const pre = await call('POST', '/api/invites/preview', ben, { token: v.token });
  assert.deepEqual([pre.status, pre.body.boardName, pre.body.role, pre.body.invitedBy, pre.body.alreadyMember, pre.body.open], [200, 'Casa', 'viewer', 'Ana', false, true]);
  assert.deepEqual((await join(call, ben, v.token)).body, { boardId: id, boardName: 'Casa', role: 'viewer', alreadyMember: false });
  assert.equal((await join(call, cai, v.token)).status, 410, 'single use by default');
  assert.equal((await call('GET', `/api/boards/${id}/db/entries`, ben)).status, 200);
  assert.equal((await call('POST', `/api/boards/${id}/db/entries`, ben, { item: 'x', amount: 1 })).status, 403);
  assert.equal((await call('POST', `/api/boards/${id}/invites`, ben, { role: 'viewer' })).status, 403);

  const e = await invite(call, id, 'editor', ana, { maxUses: 2 });
  assert.equal((await join(call, cai, e.token)).status, 201);
  const add = await call('POST', `/api/boards/${id}/db/entries`, cai, { item: 'Groceries', amount: 40, createdBy: 'u-forged' });
  assert.equal(add.status, 201);
  const doc = (await call('GET', `/api/boards/${id}/db/entries/${add.body.id}`, ana)).body;
  assert.equal(doc.data.createdBy, 'u-cai', 'who added it is set by the server');
  await call('PUT', `/api/boards/${id}/db/entries/${add.body.id}`, ben, { item: 'nope' }).then((r) => assert.equal(r.status, 403));
  const put = await call('PUT', `/api/boards/${id}/db/entries/${add.body.id}`, cai, { ...doc.data, amount: 45 });
  assert.equal(put.status, 200);
  const after = (await call('GET', `/api/boards/${id}/db/entries/${add.body.id}`, ana)).body.data;
  assert.deepEqual([after.amount, after.createdBy, after.updatedBy], [45, 'u-cai', 'u-cai']);
  // Editors can't rename the board or touch its settings.
  assert.equal((await call('PATCH', `/api/boards/${id}`, cai, { name: 'Mine' })).status, 403);
  assert.equal((await call('PUT', `/api/boards/${id}/db/settings/x`, cai, { a: 1 })).status, 403);
  assert.equal((await call('PATCH', `/api/boards/${id}`, ana, { name: 'Casa nova' })).body.name, 'Casa nova');
});

test('outsiders see nothing; a board id alone gets you nowhere', async () => {
  const { call } = setup();
  const id = await boardWith(call);
  for (const [m, p] of [['GET', `/api/boards/${id}`], ['GET', `/api/boards/${id}/db/entries`], ['POST', `/api/boards/${id}/db/entries`], ['DELETE', `/api/boards/${id}`], ['GET', `/api/boards/${id}/invites`]]) {
    assert.equal((await call(m, p, dee, { item: 'x' })).status, 404, `${m} ${p}`);
  }
  assert.equal((await call('GET', '/api/boards/not-a-uuid', ana)).status, 404);
  assert.equal((await call('POST', '/api/invites/accept', dee, { token: 'x'.repeat(43) })).status, 404);
  assert.equal((await call('POST', '/api/invites/accept', dee, { token: '../etc' })).status, 404);
});

test('roles: co-owners change roles and remove people; a board always keeps a co-owner', async () => {
  const { call } = setup();
  const id = await boardWith(call);
  await join(call, ben, (await invite(call, id, 'editor')).token);
  // the last co-owner can't step down or leave while others are on the board
  assert.equal((await call('PATCH', `/api/boards/${id}/members/u-ana`, ana, { role: 'editor' })).body.error.code, 'last_co_owner');
  assert.equal((await call('DELETE', `/api/boards/${id}/members/u-ana`, ana)).body.error.code, 'last_co_owner');
  assert.equal((await call('PATCH', `/api/boards/${id}/members/u-ben`, ben, { role: 'co_owner' })).status, 403, 'no self-promotion');
  assert.equal((await call('PATCH', `/api/boards/${id}/members/u-ben`, ana, { role: 'co_owner' })).body.role, 'co_owner');
  const members = (await call('GET', `/api/boards/${id}`, ben)).body.members;
  assert.deepEqual(members.map((m) => [m.email, m.name, m.role, m.you]), [['ana@example.com', 'Ana', 'co_owner', false], ['ben@example.com', 'Ben', 'co_owner', true]]);
  // now Ana can leave; Ben carries on
  assert.deepEqual((await call('DELETE', `/api/boards/${id}/members/u-ana`, ana)).body, { userId: 'u-ana', removed: true, left: true });
  assert.equal((await call('GET', `/api/boards/${id}`, ana)).status, 404);
  assert.equal((await call('DELETE', `/api/boards/${id}/members/u-ben`, ben)).body.error.code, 'last_member');
  assert.equal((await call('PATCH', `/api/boards/${id}/members/u-ben`, ben, { role: 'owner' })).status, 400);
});

test('a member already on the board keeps their role when they open another link', async () => {
  const { call } = setup();
  const id = await boardWith(call);
  await join(call, ben, (await invite(call, id, 'editor')).token);
  const r = await join(call, ben, (await invite(call, id, 'viewer')).token);
  assert.deepEqual([r.status, r.body.role, r.body.alreadyMember], [200, 'editor', true]);
  assert.equal((await join(call, ana, (await invite(call, id, 'viewer')).token)).body.role, 'co_owner');
});

test('invite links expire, can be revoked, and are listed without their token', async () => {
  const { call, boards } = setup();
  const id = await boardWith(call);
  const a = await invite(call, id, 'viewer', ana, { expiresInDays: 1, maxUses: 3 });
  const b = await invite(call, id, 'editor');
  const list = (await call('GET', `/api/boards/${id}/invites`, ana)).body.invites;
  assert.equal(list.length, 2); assert.ok(list.every((i) => !('token' in i) && !('token_hash' in i)));
  assert.equal((await call('DELETE', `/api/boards/${id}/invites/${b.id}`, ana)).status, 200);
  assert.equal((await join(call, ben, b.token)).status, 404, 'revoked');
  boards.invitesMap.get(a.id).expires_at = new Date(Date.now() - 1000).toISOString();
  assert.equal((await join(call, ben, a.token)).status, 410, 'expired');
  assert.equal((await call('POST', '/api/invites/preview', ben, { token: a.token })).body.open, false);
  assert.equal((await call('GET', `/api/boards/${id}/invites`, ana)).body.invites.length, 0);
  assert.equal((await call('POST', `/api/boards/${id}/invites`, ana, { role: 'viewer', expiresInDays: 90 })).status, 400);
  assert.equal((await call('POST', `/api/boards/${id}/invites`, ana, { role: 'admin' })).status, 400);
});

test('notify by email: only with the link in hand, a valid address, while the link is open', async () => {
  const { call, outbox } = setup();
  const id = await boardWith(call);
  const v = await invite(call, id, 'editor');
  const other = await invite(call, id, 'viewer');
  const path = `/api/boards/${id}/invites/${v.id}/notify`;
  assert.equal((await call('POST', path, ana, { token: other.token, email: 'ben@example.com' })).status, 400, 'token of another invite');
  assert.equal((await call('POST', path, ana, { token: v.token, email: 'not an email' })).status, 400);
  const r = await call('POST', path, ana, { token: v.token, email: ' BEN@example.com ' });
  assert.deepEqual(r.body, { id: v.id, sentTo: 'ben@example.com' });
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].subject, 'Ana invited you to “Casa” on Ongatu');
  assert.ok(outbox[0].text.includes(v.url) && outbox[0].text.includes('view and edit') && outbox[0].text.includes('only once'));
  for (let i = 0; i < 4; i++) await call('POST', path, ana, { token: v.token, email: 'ben@example.com' });
  assert.equal((await call('POST', path, ana, { token: v.token, email: 'ben@example.com' })).body.error.code, 'limit');
  const { call: call2 } = setup({ mailer: false });
  const id2 = await boardWith(call2);
  const v2 = await invite(call2, id2, 'viewer');
  assert.equal((await call2('POST', `/api/boards/${id2}/invites/${v2.id}/notify`, ana, { token: v2.token, email: 'ben@example.com' })).status, 501);
});

test('deleting a board shreds its data, members and links', async () => {
  const { call, boards } = setup();
  const id = await boardWith(call);
  const v = await invite(call, id, 'editor', ana, { maxUses: 2 });
  await join(call, ben, v.token);
  await call('POST', `/api/boards/${id}/db/entries`, ben, { item: 'x', amount: 1 });
  assert.equal((await call('DELETE', `/api/boards/${id}`, ben)).status, 403);
  assert.equal((await call('DELETE', `/api/boards/${id}`, ana)).body.deleted, true);
  assert.equal(boards.docMap.size + boards.keyMap.size + boards.invitesMap.size + boards.membersMap.size + boards.boardsMap.size, 0);
  assert.deepEqual((await call('GET', '/api/boards', ben)).body.boards, []);
  assert.equal((await join(call, cai, v.token)).status, 404);
});

test('deleting an account: boards carry on with the others (a new co-owner if needed); solo boards are shredded', async () => {
  const { call, boards } = setup();
  const shared = await boardWith(call, ana, 'Casa');
  const solo = await boardWith(call, ana, 'Solo');
  await join(call, ben, (await invite(call, shared, 'viewer')).token);
  await join(call, cai, (await invite(call, shared, 'editor')).token);
  assert.equal((await call('DELETE', '/api/me', ana)).status, 200);
  const m = (await call('GET', `/api/boards/${shared}`, cai)).body;
  assert.deepEqual(m.members.map((x) => [x.userId, x.role]), [['u-ben', 'viewer'], ['u-cai', 'co_owner']], 'the editor becomes co-owner');
  assert.ok(!boards.boardsMap.has(solo) && !boards.keyMap.has(solo));
});

test('import into a board needs an editor; limits on boards per person', async () => {
  const { call } = setup();
  const id = await boardWith(call);
  await join(call, ben, (await invite(call, id, 'viewer')).token);
  const entries = [{ date: '2026-03-01', type: 'expense', group: 'Fixed', category: 'Home', item: 'Rent', description: 'Rent', amount: 900 }];
  assert.equal((await call('POST', `/api/boards/${id}/import/commit`, ben, { entries })).status, 403);
  const r = await call('POST', `/api/boards/${id}/import/commit`, ana, { entries });
  assert.deepEqual(r.body, { saved: 1, yearsCreated: ['2026'] });
  for (let i = 1; i < MAX_BOARDS_PER_USER; i++) await boardWith(call, ana, 'B' + i);
  assert.equal((await call('POST', '/api/boards', ana, { name: 'One too many' })).body.error.code, 'limit');
});

// Oct 13: invite by email ("Board sharing" / "Share your board") and the in-app invite notifications.
test('invite by email: one bound invite per address, emailed, listed as "Invite sent", role changeable, revocable', async () => {
  const { call, outbox, boards } = setup();
  const id = await boardWith(call);
  await join(call, cai, (await invite(call, id, 'viewer')).token);
  const r = await call('POST', `/api/boards/${id}/invites/email`, ana, { emails: ' BEN@example.com, cai@example.com ' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.deepEqual(r.body.invites.map((i) => [i.email, i.status, i.role, i.mailed]), [['ben@example.com', 'sent', 'viewer', true], ['cai@example.com', 'member', undefined, undefined]]);
  assert.ok(!JSON.stringify(r.body).includes('token'), 'the token is not returned');
  assert.equal(outbox.length, 1);
  assert.ok(outbox[0].to === 'ben@example.com' && outbox[0].text.includes('https://app.test/join#'));
  const list = (await call('GET', `/api/boards/${id}/invites`, ana)).body.invites;
  const sent = list.find((i) => i.email === 'ben@example.com');
  assert.ok(sent);
  assert.equal((await call('PATCH', `/api/boards/${id}/invites/${sent.id}`, ana, { role: 'editor' })).body.role, 'editor');
  assert.equal((await call('PATCH', `/api/boards/${id}/invites/${sent.id}`, ana, { role: 'owner' })).status, 400);
  assert.equal((await call('PATCH', `/api/boards/${id}/invites/${sent.id}`, cai, { role: 'co_owner' })).status, 403, 'viewers cannot');
  assert.equal((await call('POST', `/api/boards/${id}/invites/email`, cai, { emails: ['dee@example.com'] })).status, 403);
  assert.equal((await call('POST', `/api/boards/${id}/invites/email`, ana, { emails: ['nope'] })).status, 400);
  // Inviting the same address again replaces the open invite.
  await call('POST', `/api/boards/${id}/invites/email`, ana, { emails: ['ben@example.com'] });
  assert.equal([...boards.invitesMap.values()].filter((i) => i.email === 'ben@example.com' && !i.revoked_at).length, 1);
  // Without a mailer the in-app invite is still created.
  const { call: call2 } = setup({ mailer: false });
  const id2 = await boardWith(call2);
  const r2 = await call2('POST', `/api/boards/${id2}/invites/email`, ana, { emails: ['ben@example.com'] });
  assert.deepEqual(r2.body.invites.map((i) => [i.status, i.mailed]), [['sent', false]]);
});

test('invites to my address: listed for me only, accepted or declined without the link; the inviter sees who accepted', async () => {
  const { call } = setup();
  const id = await boardWith(call);
  await call('POST', `/api/boards/${id}/invites/email`, ana, { emails: ['ben@example.com', 'dee@example.com'], role: 'editor' });
  const mine = (await call('GET', '/api/invites/mine', ben)).body;
  assert.deepEqual(mine.invites.map((i) => [i.boardName, i.role, i.invitedBy]), [['Casa', 'editor', 'Ana']]);
  assert.equal((await call('GET', '/api/invites/mine', cai)).body.invites.length, 0, 'another address sees nothing');
  const inv = mine.invites[0];
  assert.equal((await call('POST', `/api/invites/mine/${inv.id}/accept`, cai)).status, 404, 'not bound to cai');
  const ok = await call('POST', `/api/invites/mine/${inv.id}/accept`, ben);
  assert.deepEqual([ok.status, ok.body.role], [201, 'editor']);
  assert.equal((await call('GET', `/api/boards/${id}/db/entries`, ben)).status, 200);
  assert.equal((await call('GET', '/api/invites/mine', ben)).body.invites.length, 0, 'gone once accepted');
  const acc = (await call('GET', '/api/invites/mine', ana)).body.accepted;
  assert.deepEqual(acc.map((a) => [a.boardName, a.name]), [['Casa', 'Ben']]);
  const deeInv = (await call('GET', '/api/invites/mine', dee)).body.invites[0];
  assert.equal((await call('POST', `/api/invites/mine/${deeInv.id}/decline`, dee)).status, 200);
  assert.equal((await call('GET', '/api/invites/mine', dee)).body.invites.length, 0);
  assert.equal((await call('POST', `/api/invites/mine/${deeInv.id}/accept`, dee)).status, 404, 'a declined invite is closed');
  assert.equal((await call('GET', `/api/boards/${id}/invites`, ana)).body.invites.length, 0, 'declined invites leave the list');
});
