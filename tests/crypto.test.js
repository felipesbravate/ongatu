import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptBytes, decryptJson, encryptBytes, encryptJson, newKey } from '../src/lib/crypto.js';
import { loadMasterKeys, unwrapDek, wrapDek, newDek } from '../src/lib/keyring.js';
import { Vault, VaultError, memoryStores } from '../src/lib/vault.js';

const mk = () => ({ active: 'v1', keys: { v1: randomBytes(32) } });

test('round trip and non-determinism', () => {
  const k = newKey();
  const a = encryptJson(k, { amount: 12.5 }, 'x');
  const b = encryptJson(k, { amount: 12.5 }, 'x');
  assert.notEqual(a, b);
  assert.deepEqual(decryptJson(k, a, 'x'), { amount: 12.5 });
});

test('ciphertext does not contain plaintext', () => {
  const k = newKey();
  const blob = encryptJson(k, { description: 'Rent September' }, 'x');
  assert.ok(!Buffer.from(blob, 'base64').toString('latin1').includes('Rent'));
});

test('wrong key, wrong AAD, tampering and truncation all fail', () => {
  const k = newKey();
  const blob = encryptBytes(k, Buffer.from('hello'), 'a');
  assert.throws(() => decryptBytes(newKey(), blob, 'a'), /decryption failed/);
  assert.throws(() => decryptBytes(k, blob, 'b'), /decryption failed/);
  const t = Buffer.from(blob); t[t.length - 1] ^= 1;
  assert.throws(() => decryptBytes(k, t, 'a'), /decryption failed/);
  const h = Buffer.from(blob); h[20] ^= 1; // inside the tag
  assert.throws(() => decryptBytes(k, h, 'a'), /decryption failed/);
  assert.throws(() => decryptBytes(k, blob.subarray(0, 10), 'a'), /too short/);
  const v = Buffer.from(blob); v[0] = 9;
  assert.throws(() => decryptBytes(k, v, 'a'), /version/);
});

test('rejects bad keys', () => {
  assert.throws(() => encryptBytes(Buffer.alloc(16), Buffer.from('x'), 'a'), /32-byte/);
});

test('loadMasterKeys validates input', () => {
  const good = { MASTER_KEYS: JSON.stringify({ v1: randomBytes(32).toString('base64') }), MASTER_KEY_ACTIVE: 'v1' };
  assert.equal(loadMasterKeys(good).active, 'v1');
  assert.throws(() => loadMasterKeys({}), /must be set/);
  assert.throws(() => loadMasterKeys({ MASTER_KEYS: '{', MASTER_KEY_ACTIVE: 'v1' }), /valid JSON/);
  assert.throws(() => loadMasterKeys({ MASTER_KEYS: JSON.stringify({ v1: 'AAAA' }), MASTER_KEY_ACTIVE: 'v1' }), /32 bytes/);
  assert.throws(() => loadMasterKeys({ ...good, MASTER_KEY_ACTIVE: 'v2' }), /not present/);
});

test('wrapped DEK is bound to its user', () => {
  const m = mk(); const dek = newDek();
  const w = wrapDek(m, 'alice', dek);
  assert.deepEqual(unwrapDek(m, 'alice', w.kekVersion, w.wrapped), dek);
  assert.throws(() => unwrapDek(m, 'bob', w.kekVersion, w.wrapped), /decryption failed/);
});

test('vault: per-user isolation, AAD binding, and erase', async () => {
  const s = memoryStores();
  const v = new Vault({ master: mk(), keys: s.keys, docs: s.docs });
  const { id } = await v.add('alice', 'entries', { amount: 10, item: 'Coffee' });
  await v.set('bob', 'entries', 'b1', { amount: 99 });
  assert.deepEqual((await v.list('alice', 'entries')).map((d) => d.data.amount), [10]);
  assert.deepEqual((await v.list('bob', 'entries')).map((d) => d.data.amount), [99]);

  // Copy Alice's row to Bob (as a malicious DB admin might): must not decrypt.
  const row = await s.docs.get('alice', 'entries', id);
  await s.docs.put({ ...row, user_id: 'bob' });
  await assert.rejects(v.list('bob', 'entries'), /decryption failed/);
  await s.docs.remove('bob', 'entries', id);
  // Same user, different doc id.
  await s.docs.put({ ...row, doc_id: 'other' });
  await assert.rejects(v.get('alice', 'entries', 'other'), /decryption failed/);
  await s.docs.remove('alice', 'entries', 'other');

  // Nothing readable in storage.
  for (const r of s.docMap.values()) assert.ok(!JSON.stringify(r).includes('Coffee'));

  await v.eraseUser('alice');
  assert.equal(s.keyMap.has('alice'), false);
  assert.deepEqual(await v.list('alice', 'entries'), []);
});

test('vault: input validation', async () => {
  const s = memoryStores();
  const v = new Vault({ master: mk(), keys: s.keys, docs: s.docs });
  await assert.rejects(v.set('a', 'nope', 'x', {}), (e) => e instanceof VaultError && e.code === 'bad_collection');
  await assert.rejects(v.set('a', 'entries', '../x', {}), (e) => e.code === 'bad_id');
  await assert.rejects(v.set('a', 'entries', 'x', [1]), (e) => e.code === 'bad_doc');
  await assert.rejects(v.set('a', 'entries', 'x', { s: 'y'.repeat(40000) }), (e) => e.code === 'too_large');
});

test('master key rotation re-wraps without touching data', async () => {
  const s = memoryStores();
  const old = randomBytes(32), fresh = randomBytes(32);
  const v1 = new Vault({ master: { active: 'v1', keys: { v1: old } }, keys: s.keys, docs: s.docs });
  await v1.set('alice', 'entries', 'e1', { amount: 5 });
  const payloadBefore = s.docMap.values().next().value.payload;
  const v2 = new Vault({ master: { active: 'v2', keys: { v1: old, v2: fresh } }, keys: s.keys, docs: s.docs });
  assert.equal(await v2.rewrapUser('alice'), true);
  assert.equal(s.keyMap.get('alice').kekVersion, 'v2');
  assert.equal(s.docMap.values().next().value.payload, payloadBefore);
  const v3 = new Vault({ master: { active: 'v2', keys: { v2: fresh } }, keys: s.keys, docs: s.docs });
  assert.equal((await v3.get('alice', 'entries', 'e1')).data.amount, 5);
});

// Oct 4: a brand-new account's first page load asks for years, settings, entries… at once, often on different
// serverless instances. Each saw "no key", made its own, and the later one replaced the earlier: documents written
// with the first key became unreadable and the onboarding gate never got its answer.
test('vault: concurrent first requests (two instances) agree on one data key', async () => {
  const s = memoryStores();
  const slowGet = s.keys.get;
  const keys = { ...s.keys, async get(u) { const r = await slowGet(u); await new Promise((ok) => setTimeout(ok, 5)); return r; } };
  const master = mk();
  const a = new Vault({ master, keys, docs: s.docs }), b = new Vault({ master, keys, docs: s.docs });
  await Promise.all([a.set('neo', 'settings', 'profile', { firstName: 'Neo' }), b.list('neo', 'years'), a.list('neo', 'entries'), b.set('neo', 'years', 'y1', { year: '2026' })]);
  const c = new Vault({ master, keys, docs: s.docs }); // a third, cold instance reads everything
  assert.deepEqual((await c.list('neo', 'settings')).map((d) => d.data.firstName), ['Neo']);
  assert.deepEqual((await c.list('neo', 'years')).map((d) => d.data.year), ['2026']);
  assert.deepEqual((await a.list('neo', 'years')).map((d) => d.data.year), ['2026']);
  assert.deepEqual((await b.list('neo', 'settings')).map((d) => d.data.firstName), ['Neo']);
});
