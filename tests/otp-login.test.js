import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanCode, cleanEmail, emailCookieOptions, EMAIL_COOKIE_MAX_AGE } from '../src/lib/otp-login.js';
import { cleanName, decodeCtx, encodeCtx, greetingName } from '../src/lib/otp-login.js';
import { memoryAccounts, memoryProfiles } from '../src/lib/api.js';

test('codes: exactly 6 digits, pasted spaces/dashes tolerated', () => {
  assert.equal(cleanCode('123456'), '123456');
  assert.equal(cleanCode(' 123 456 '), '123456');
  assert.equal(cleanCode('123-456'), '123456');
  assert.equal(cleanCode('12345'), null);
  assert.equal(cleanCode('12345a'), null);
  assert.equal(cleanCode(null), null);
  assert.equal(cleanCode('12345678'), null); // the old 8-digit length is refused
});
test('emails normalized, junk rejected', () => {
  assert.equal(cleanEmail('  Ann@Example.COM '), 'ann@example.com');
  assert.equal(cleanEmail('nope'), null);
  assert.equal(cleanEmail(undefined), null);
});
test('email cookie is httpOnly, short-lived, secure on https', () => {
  const o = emailCookieOptions(true);
  assert.deepEqual([o.httpOnly, o.secure, o.sameSite, o.maxAge], [true, true, 'lax', EMAIL_COOKIE_MAX_AGE]);
  assert.equal(emailCookieOptions(false).secure, false);
});
test('login context cookie: round-trips, rejects junk and unknown steps', () => {
  assert.deepEqual(decodeCtx(encodeCtx({ k: 'password', n: 'Felipe' })), { k: 'password', n: 'Felipe' });
  assert.deepEqual(decodeCtx(encodeCtx({ k: 'new', n: 'x'.repeat(200) })).n.length, 80);
  assert.equal(decodeCtx('not base64 json'), null);
  assert.equal(decodeCtx(Buffer.from('{"k":"admin"}').toString('base64url')), null);
  assert.equal(decodeCtx(undefined), null);
});
test('names: typed names cleaned; greeting = first word, else from the address', () => {
  assert.equal(cleanName('  Felipe   Sbravate \n'), 'Felipe Sbravate');
  assert.equal(cleanName('\u0000\u0007'), null);
  assert.equal(cleanName('a'.repeat(100)).length, 80);
  assert.equal(greetingName('Felipe Sbravate', 'x@y.z'), 'Felipe');
  assert.equal(greetingName(null, 'felipe.sbravate@example.com'), 'Felipe');
  assert.equal(greetingName('', 'ann2@example.com'), 'Ann');
});
test('accounts.lookup (memory): no profile = new; profile = existing, with its method and name', async () => {
  const profiles = memoryProfiles();
  const acc = memoryAccounts(profiles);
  assert.deepEqual(await acc.lookup('ann@example.com'), { exists: false, method: 'code', name: null });
  await profiles.upsert({ user_id: 'u1', email: 'ann@example.com', status: 'approved' });
  assert.deepEqual(await acc.lookup('Ann@Example.com'), { exists: true, method: 'code', name: null });
  await acc.setPassword({ id: 'u1', email: 'ann@example.com' }, 'long-enough');
  acc.names.set('ann@example.com', 'Ann Lee');
  assert.deepEqual(await acc.lookup('ann@example.com'), { exists: true, method: 'password', name: 'Ann Lee' });
  assert.equal((await profiles.byEmail('ann@example.com')).user_id, 'u1');
});
