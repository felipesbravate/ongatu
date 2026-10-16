// A missing table/column (an un-run migration) surfaces as not_migrated with a readable message, not "Something went wrong".
import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseStores } from '../src/lib/supabase-stores.js';
import { safeError } from '../src/lib/security.js';

const fakeSb = (error) => {
  const q = { select: () => q, eq: () => q, order: () => q, insert: async () => ({ error }), maybeSingle: async () => ({ error }) };
  return { from: () => q };
};

test('a missing table says to run the migrations', async () => {
  const s = supabaseStores(fakeSb({ code: 'PGRST205', message: "Could not find the table 'public.boards' in the schema cache" }));
  await assert.rejects(() => s.boards.create({ id: 'x', created_by: 'u', created_at: 'now' }), (e) => {
    const out = safeError(e);
    assert.equal(out.code, 'not_migrated');
    assert.match(out.message, /public\.boards/);
    assert.match(out.message, /supabase\/migrations/);
    return true;
  });
});

test('other database errors stay generic', async () => {
  const s = supabaseStores(fakeSb({ code: '23505', message: 'duplicate key value' }));
  await assert.rejects(() => s.boards.create({ id: 'x' }), (e) => safeError(e).code === 'internal');
});
